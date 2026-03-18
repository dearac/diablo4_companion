# ============================================================
# setup-sidecar.ps1 — Bootstrap the Python + Tesseract environment
# ============================================================
# Downloads and configures a fully portable Python environment
# in sidecar/python/ with all dependencies pre-installed.
#
# This runs during development setup, NOT in production.
# In production, the SidecarManager's PythonBootstrapper.ts
# handles auto-setup at runtime.
#
# Usage: .\scripts\setup-sidecar.ps1
# ============================================================

$ErrorActionPreference = "Stop"

$PYTHON_VERSION = "3.12.10"
$PYTHON_ZIP = "python-$PYTHON_VERSION-embed-amd64.zip"
$PYTHON_URL = "https://www.python.org/ftp/python/$PYTHON_VERSION/$PYTHON_ZIP"
$GET_PIP_URL = "https://bootstrap.pypa.io/get-pip.py"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$SidecarDir = Join-Path $ProjectRoot "sidecar"
$PythonDir = Join-Path $SidecarDir "python"
$SitePackages = Join-Path $PythonDir "Lib\site-packages"
$Requirements = Join-Path $SidecarDir "requirements.txt"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Diablo IV Companion — Sidecar Setup" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# ---- Step 1: Download Embeddable Python ----
if (Test-Path (Join-Path $PythonDir "python.exe")) {
    Write-Host "[OK] Python already exists at $PythonDir" -ForegroundColor Green
} else {
    Write-Host "[1/4] Downloading Python $PYTHON_VERSION Embeddable..." -ForegroundColor Yellow
    
    $TempZip = Join-Path $env:TEMP $PYTHON_ZIP
    if (-not (Test-Path $TempZip)) {
        Invoke-WebRequest -Uri $PYTHON_URL -OutFile $TempZip -UseBasicParsing
    }
    
    Write-Host "       Extracting to $PythonDir..."
    New-Item -Path $PythonDir -ItemType Directory -Force | Out-Null
    Expand-Archive -Path $TempZip -DestinationPath $PythonDir -Force
    
    Write-Host "       Done." -ForegroundColor Green
}

# ---- Step 2: Enable site-packages in the ._pth file ----
Write-Host "[2/4] Configuring Python path..." -ForegroundColor Yellow

$PthFile = Get-ChildItem -Path $PythonDir -Filter "python*._pth" | Select-Object -First 1
if ($PthFile) {
    $content = Get-Content $PthFile.FullName -Raw
    # Uncomment 'import site' if commented
    $content = $content -replace '#\s*import site', 'import site'
    # Add Lib\site-packages if not present
    if ($content -notmatch 'Lib\\site-packages') {
        $content = $content.TrimEnd() + "`nLib\site-packages`n"
    }
    Set-Content -Path $PthFile.FullName -Value $content -NoNewline
    Write-Host "       Updated $($PthFile.Name)" -ForegroundColor Green
} else {
    Write-Host "       WARNING: No ._pth file found!" -ForegroundColor Red
}

# Create the site-packages directory
New-Item -Path $SitePackages -ItemType Directory -Force | Out-Null

# ---- Step 3: Bootstrap pip ----
$PipExe = Join-Path $PythonDir "Scripts\pip.exe"
$PythonExe = Join-Path $PythonDir "python.exe"

if (Test-Path $PipExe) {
    Write-Host "[OK] pip already installed" -ForegroundColor Green
} else {
    Write-Host "[3/4] Installing pip..." -ForegroundColor Yellow
    
    $GetPip = Join-Path $env:TEMP "get-pip.py"
    if (-not (Test-Path $GetPip)) {
        Invoke-WebRequest -Uri $GET_PIP_URL -OutFile $GetPip -UseBasicParsing
    }
    
    # Run get-pip.py with the portable Python — no PYTHONPATH to avoid conflicts
    $env:PYTHONPATH = ""
    & $PythonExe $GetPip --no-warn-script-location
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "       ERROR: pip installation failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "       Done." -ForegroundColor Green
}

# ---- Step 4: Install dependencies ----
Write-Host "[4/4] Installing dependencies from requirements.txt..." -ForegroundColor Yellow

$env:PYTHONPATH = ""
& $PythonExe -m pip install -r $Requirements --target $SitePackages --no-warn-script-location --quiet

if ($LASTEXITCODE -ne 0) {
    Write-Host "       ERROR: dependency installation failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Sidecar environment ready!" -ForegroundColor Green
Write-Host "  Python: $PythonExe" -ForegroundColor Green
Write-Host "  Packages: $SitePackages" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
