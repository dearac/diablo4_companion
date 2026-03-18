#!/usr/bin/env python3
"""
scan.py — Diablo IV Tooltip OCR Sidecar

Entry point for the Python sidecar process. Communicates with
the Electron main process via newline-delimited JSON over
stdin/stdout.

Protocol:
  IN  (stdin):  {"id": "abc123", "cmd": "ocr", "image": "<base64 PNG>"}
  OUT (stdout): {"id": "abc123", "ok": true, "result": {...}}
  ERR (stdout): {"id": "abc123", "ok": false, "error": "message"}

Commands:
  ping   — Health check, returns {"status": "ready"}
  ocr    — Process a base64 PNG image through the OCR pipeline
"""

import sys
import json
import base64
import traceback
import os

# ================================================================
# Portable environment path resolution
# ================================================================
# When running from the PythonBootstrapper's portable Python,
# packages are installed in data/python/Lib/site-packages.
# We also check sidecar/python/ for dev-mode bundled envs.
# This MUST happen before any third-party imports.

SIDECAR_DIR = os.path.dirname(os.path.abspath(__file__))

# Add sidecar dir itself so sibling modules (ocr_pipeline, tooltip_parser) resolve
if SIDECAR_DIR not in sys.path:
    sys.path.insert(0, SIDECAR_DIR)

# Check for portable site-packages in multiple locations
_possible_sites = [
    os.path.join(SIDECAR_DIR, "python", "Lib", "site-packages"),          # dev bundled
    os.path.join(os.path.dirname(SIDECAR_DIR), "data", "python", "Lib", "site-packages"),  # PythonBootstrapper (dev)
]
# Production: resources/sidecar/ → data/python/Lib/site-packages is higher up
_res_parent = os.path.dirname(os.path.dirname(SIDECAR_DIR))  # up from resources/sidecar
_possible_sites.append(os.path.join(_res_parent, "data", "python", "Lib", "site-packages"))

for _site in _possible_sites:
    if os.path.isdir(_site) and _site not in sys.path:
        sys.path.insert(0, _site)

# Set TESSDATA_PREFIX for bundled Tesseract
for _tess_base in [SIDECAR_DIR, os.path.dirname(SIDECAR_DIR)]:
    _tessdata = os.path.join(_tess_base, "tesseract", "tessdata")
    if os.path.isdir(_tessdata):
        os.environ["TESSDATA_PREFIX"] = _tessdata
        break

# ================================================================
# Third-party imports (after path setup)
# ================================================================

import numpy as np
import cv2

from ocr_pipeline import run_ocr_pipeline
from tooltip_parser import parse_tooltip_text

# ================================================================
# Configure pytesseract to find the portable Tesseract binary
# ================================================================
try:
    import pytesseract

    # Check for explicit path from SidecarManager environment
    _tess_cmd = os.environ.get("TESSERACT_CMD")
    if _tess_cmd and os.path.isfile(_tess_cmd):
        pytesseract.pytesseract.tesseract_cmd = _tess_cmd
    else:
        # Search portable locations
        for _base in [SIDECAR_DIR, os.path.dirname(SIDECAR_DIR)]:
            _tess_exe = os.path.join(_base, "tesseract", "tesseract.exe")
            if os.path.isfile(_tess_exe):
                pytesseract.pytesseract.tesseract_cmd = _tess_exe
                break
        else:
            # Check data directory (PythonBootstrapper install)
            _data_tess = os.path.join(
                os.path.dirname(SIDECAR_DIR), "data", "tesseract", "tesseract.exe"
            )
            if os.path.isfile(_data_tess):
                pytesseract.pytesseract.tesseract_cmd = _data_tess
except ImportError:
    pass  # pytesseract not yet installed


def handle_ping(request: dict) -> dict:
    """Health check — confirms the sidecar is alive and ready."""
    return {"status": "ready", "version": "1.0.0"}


def handle_ocr(request: dict) -> dict:
    """
    Process a base64-encoded PNG screenshot through the OCR pipeline.

    Expected fields:
      image: str — base64-encoded PNG image data
      debug: bool (optional) — save intermediate pipeline stages to disk

    Returns:
      A parsed tooltip object (IScannedItem-compatible dict)
    """
    image_b64 = request.get("image")
    if not image_b64:
        raise ValueError("Missing 'image' field in OCR request")

    # Decode base64 → numpy array
    image_bytes = base64.b64decode(image_b64)
    np_arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    if img is None:
        raise ValueError("Failed to decode image from base64 data")

    debug_mode = request.get("debug", False)
    debug_dir = request.get("debugDir", None)

    # Step 1: Run the OpenCV preprocessing + Tesseract OCR pipeline
    raw_text = run_ocr_pipeline(img, debug=debug_mode, debug_dir=debug_dir)

    if not raw_text or len(raw_text.strip()) < 5:
        return {
            "success": False,
            "error": "OCR produced no readable text",
            "rawText": raw_text or ""
        }

    # Step 2: Parse the raw OCR text into a structured item
    parsed_item = parse_tooltip_text(raw_text)

    return {
        "success": True,
        "item": parsed_item,
        "rawText": raw_text
    }


# ================================================================
# Command dispatcher
# ================================================================

COMMANDS = {
    "ping": handle_ping,
    "ocr": handle_ocr,
}


def process_request(request: dict) -> dict:
    """Dispatches a request to the appropriate handler."""
    cmd = request.get("cmd")
    if not cmd:
        return {"ok": False, "error": "Missing 'cmd' field"}

    handler = COMMANDS.get(cmd)
    if not handler:
        return {"ok": False, "error": f"Unknown command: {cmd}"}

    try:
        result = handler(request)
        return {"ok": True, "result": result}
    except Exception as e:
        return {
            "ok": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }


def main():
    """
    Main loop — reads JSON commands from stdin, writes JSON responses
    to stdout. One JSON object per line (newline-delimited).

    The process runs indefinitely until stdin is closed (Electron quits)
    or a fatal error occurs.
    """
    # Unbuffered stdout for real-time IPC
    sys.stdout = open(sys.stdout.fileno(), mode='w', buffering=1, encoding='utf-8')

    # Signal readiness
    startup_msg = json.dumps({"type": "ready", "version": "1.0.0"})
    print(startup_msg, flush=True)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
        except json.JSONDecodeError as e:
            error_response = json.dumps({
                "ok": False,
                "error": f"Invalid JSON: {e}"
            })
            print(error_response, flush=True)
            continue

        # Preserve the request ID for response matching
        request_id = request.get("id", None)
        response = process_request(request)
        response["id"] = request_id

        # Write response as a single JSON line
        print(json.dumps(response), flush=True)


if __name__ == "__main__":
    main()
