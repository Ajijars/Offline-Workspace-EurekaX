# ============================================
# EurekaX Project – Ollama Setup Script (Windows)
# ============================================
# Run this script in PowerShell to set up Ollama
# Usage: .\scripts\setup_ollama.ps1

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  EurekaX Project – Ollama Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ── GPU Configuration ──
# Force all model layers onto GPU for maximum inference speed.
# These are set as persistent User-level environment variables.
Write-Host "Configuring GPU acceleration..." -ForegroundColor Yellow

$gpuVars = @{
    "OLLAMA_NUM_GPU"         = "999"    # Offload all layers to GPU
    "OLLAMA_FLASH_ATTENTION" = "1"      # Enable flash attention (faster inference)
    "CUDA_VISIBLE_DEVICES"   = "0"      # Use first GPU
}

foreach ($key in $gpuVars.Keys) {
    $current = [System.Environment]::GetEnvironmentVariable($key, 'User')
    if ($current -ne $gpuVars[$key]) {
        [System.Environment]::SetEnvironmentVariable($key, $gpuVars[$key], 'User')
        Write-Host "  [SET] $key = $($gpuVars[$key])" -ForegroundColor DarkGray
    } else {
        Write-Host "  [OK]  $key = $($gpuVars[$key]) (already set)" -ForegroundColor DarkGray
    }
    # Also set for current session
    Set-Item -Path "Env:\$key" -Value $gpuVars[$key]
}

# Check NVIDIA GPU
try {
    $gpu = & nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>$null
    if ($gpu) {
        Write-Host "[OK] GPU detected: $($gpu.Trim())" -ForegroundColor Green
    } else {
        Write-Host "[!] No NVIDIA GPU detected. Ollama will use CPU (slower)." -ForegroundColor Yellow
    }
} catch {
    Write-Host "[!] nvidia-smi not found. GPU acceleration may not be available." -ForegroundColor Yellow
}

# Check if Ollama is installed
$ollamaPath = Get-Command ollama -ErrorAction SilentlyContinue

if (-not $ollamaPath) {
    Write-Host "[!] Ollama is not installed." -ForegroundColor Red
    Write-Host ""
    Write-Host "Please download and install Ollama from:" -ForegroundColor Yellow
    Write-Host "  https://ollama.com/download" -ForegroundColor Green
    Write-Host ""
    Write-Host "After installing, re-run this script." -ForegroundColor Yellow
    exit 1
}

Write-Host "[OK] Ollama is installed: $($ollamaPath.Source)" -ForegroundColor Green

# Check if Ollama is running
Write-Host ""
Write-Host "Checking if Ollama server is running..." -ForegroundColor Yellow

try {
    $response = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "[OK] Ollama server is running." -ForegroundColor Green
} catch {
    Write-Host "[!] Ollama server is not running. Starting it..." -ForegroundColor Yellow
    Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep -Seconds 3
    Write-Host "[OK] Ollama server started." -ForegroundColor Green
}

# Pull required models
$models = @("qwen3:8b", "qwen2.5-coder:7b")

foreach ($model in $models) {
    Write-Host ""
    Write-Host "Checking model: $model ..." -ForegroundColor Yellow

    $existing = & ollama list 2>$null | Select-String $model
    if ($existing) {
        Write-Host "[OK] Model '$model' already available." -ForegroundColor Green
    } else {
        Write-Host "Pulling model: $model (this may take a while on first download)..." -ForegroundColor Yellow
        & ollama pull $model
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[OK] Model '$model' is ready!" -ForegroundColor Green
        } else {
            Write-Host "[!] Failed to pull model '$model'." -ForegroundColor Red
        }
    }
}

# Final status
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "GPU Config:" -ForegroundColor Yellow
Write-Host "  OLLAMA_NUM_GPU=999 (all layers on GPU)" -ForegroundColor White
Write-Host "  OLLAMA_FLASH_ATTENTION=1 (fast inference)" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. pip install -r requirements.txt" -ForegroundColor White
Write-Host "  2. uvicorn app.main:app --reload" -ForegroundColor White
Write-Host "  3. cd frontend && npm run dev" -ForegroundColor White
Write-Host "  4. Open http://localhost:3000" -ForegroundColor White
Write-Host ""
