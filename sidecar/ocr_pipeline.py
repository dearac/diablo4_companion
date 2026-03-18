"""
ocr_pipeline.py — OpenCV preprocessing + Tesseract OCR

Implements the proven 4-step pipeline for reading Diablo IV
game tooltips:

  Step 0: Contour-based tooltip isolation (find the dark rectangle)
  Step 1: Grayscale conversion
  Step 2: Bicubic upscaling (target 30-33px capital letter height)
  Step 3: Otsu's thresholding
  Step 4: Bitwise NOT inversion

After preprocessing, runs Tesseract with PSM 6 (single text block).
Falls back to PSM 4 if the result is too short.
"""

import os
import sys
import cv2
import numpy as np
import pytesseract


def find_tooltip_region(img: np.ndarray) -> np.ndarray:
    """
    Step 0 — Isolate the tooltip from the game screenshot.

    D4 tooltips are dark semi-transparent rectangles with bright text.
    We find them by looking for large, dark, rectangular contours.

    Args:
        img: BGR image (the cropped region from ScreenCaptureService)

    Returns:
        Cropped image containing just the tooltip, or the original
        image if no tooltip region could be isolated.
    """
    h, w = img.shape[:2]

    # Convert to grayscale and look for dark regions
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Threshold to find dark areas (tooltip background is dark)
    # Pixels below threshold → white (candidate regions)
    _, dark_mask = cv2.threshold(gray, 80, 255, cv2.THRESH_BINARY_INV)

    # Morphological close to fill gaps in the dark region
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15))
    dark_mask = cv2.morphologyEx(dark_mask, cv2.MORPH_CLOSE, kernel)

    # Find contours of dark regions
    contours, _ = cv2.findContours(dark_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    best_box = None
    best_area = 0

    for contour in contours:
        x, y, cw, ch = cv2.boundingRect(contour)
        area = cw * ch
        aspect_ratio = cw / ch if ch > 0 else 0

        # Filter: tooltip should be a tall rectangle
        # Aspect ratio between 0.3 (very tall) and 1.5 (somewhat wide)
        # Size: at least 12% and at most 60% of the image area
        min_area = w * h * 0.12
        max_area = w * h * 0.60

        if (0.3 <= aspect_ratio <= 1.5 and
                min_area <= area <= max_area and
                area > best_area):
            best_box = (x, y, cw, ch)
            best_area = area

    if best_box is None:
        # Fallback: try brightness-based detection
        return _brightness_fallback(img)

    x, y, cw, ch = best_box

    # Add a 5% padding (safety margin)
    pad_x = int(cw * 0.05)
    pad_y = int(ch * 0.05)

    x1 = max(0, x - pad_x)
    y1 = max(0, y - pad_y)
    x2 = min(w, x + cw + pad_x)
    y2 = min(h, y + ch + pad_y)

    return img[y1:y2, x1:x2]


def _brightness_fallback(img: np.ndarray) -> np.ndarray:
    """
    Fallback tooltip detection using text brightness concentration.

    If contour detection fails, look for the region with the
    highest concentration of bright pixels (the tooltip text).
    """
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Threshold for bright text pixels
    _, bright_mask = cv2.threshold(gray, 180, 255, cv2.THRESH_BINARY)

    # Scan columns to find horizontal extent of text
    col_brightness = np.sum(bright_mask, axis=0) / h

    # Find start and end of the text region (where brightness > 5%)
    threshold = 0.05 * 255
    text_cols = np.where(col_brightness > threshold)[0]

    if len(text_cols) < 10:
        # Not enough signal — return the whole image
        return img

    x_start = max(0, text_cols[0] - int(w * 0.02))
    x_end = min(w, text_cols[-1] + int(w * 0.02))

    # Scan rows similarly
    row_brightness = np.sum(bright_mask, axis=1) / w
    text_rows = np.where(row_brightness > threshold)[0]

    if len(text_rows) < 5:
        return img

    y_start = max(0, text_rows[0] - int(h * 0.02))
    y_end = min(h, text_rows[-1] + int(h * 0.02))

    return img[y_start:y_end, x_start:x_end]


def preprocess_for_ocr(tooltip_img: np.ndarray) -> np.ndarray:
    """
    Steps 1-4 — Preprocess the tooltip image for Tesseract.

    1. Grayscale conversion
    2. Bicubic upscaling (dynamic factor targeting 30-33px caps)
    3. Otsu's thresholding
    4. Bitwise NOT inversion
    """
    # Step 1: Grayscale
    if len(tooltip_img.shape) == 3:
        gray = cv2.cvtColor(tooltip_img, cv2.COLOR_BGR2GRAY)
    else:
        gray = tooltip_img

    # Step 2: Dynamic upscaling
    # Target: capital letters should be ~30-33px tall
    # Heuristic: scale based on image height
    # A typical tooltip at 1080p is ~400-600px tall with ~20-30 text lines
    # Each line is ~15-20px → scale up so lines are ~30-35px
    h = gray.shape[0]
    if h < 300:
        scale = 2.5
    elif h < 600:
        scale = 2.0
    elif h < 1000:
        scale = 1.5
    else:
        scale = 1.2  # Already very large (4K)

    upscaled = cv2.resize(gray, None, fx=scale, fy=scale,
                          interpolation=cv2.INTER_CUBIC)

    # Step 3: Otsu's thresholding
    _, binary = cv2.threshold(upscaled, 0, 255,
                              cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # Step 4: Invert (Tesseract wants black text on white background)
    inverted = cv2.bitwise_not(binary)

    return inverted


def run_tesseract(processed_img: np.ndarray) -> str:
    """
    Run Tesseract OCR on a preprocessed image.

    Tries PSM 6 first (single uniform text block), then
    falls back to PSM 4 (variable-size text column) if
    the result is suspiciously short.
    """
    # Configure Tesseract
    config_psm6 = '--psm 6 --oem 3'
    config_psm4 = '--psm 4 --oem 3'

    # First attempt: PSM 6
    text = pytesseract.image_to_string(processed_img, config=config_psm6)

    # If result is too short, the PSM mode might be wrong
    if len(text.strip()) < 10:
        text_alt = pytesseract.image_to_string(processed_img, config=config_psm4)
        if len(text_alt.strip()) > len(text.strip()):
            text = text_alt

    return text


def run_ocr_pipeline(img: np.ndarray,
                     debug: bool = False,
                     debug_dir: str = None) -> str:
    """
    Full OCR pipeline: isolate → preprocess → OCR.

    Args:
        img: BGR screenshot image (the cropped tooltip region)
        debug: If True, save intermediate images to debug_dir
        debug_dir: Directory to save debug images (required if debug=True)

    Returns:
        Raw OCR text from the tooltip
    """
    # Step 0: Isolate the tooltip region
    tooltip = find_tooltip_region(img)

    # Steps 1-4: Preprocess
    processed = preprocess_for_ocr(tooltip)

    # Debug mode: save intermediate images
    if debug and debug_dir:
        os.makedirs(debug_dir, exist_ok=True)
        cv2.imwrite(os.path.join(debug_dir, '01_raw_input.png'), img)
        cv2.imwrite(os.path.join(debug_dir, '02_tooltip_crop.png'), tooltip)
        cv2.imwrite(os.path.join(debug_dir, '03_processed.png'), processed)

    # Run Tesseract
    text = run_tesseract(processed)

    # Debug: save raw OCR text
    if debug and debug_dir:
        with open(os.path.join(debug_dir, '04_ocr_text.txt'), 'w',
                  encoding='utf-8') as f:
            f.write(text)

    return text
