# ─────────────────────────────────────────────────────────────────
# EurekaX Client — One-Click Setup Script (Windows PowerShell)
# ─────────────────────────────────────────────────────────────────
# Run from the client/ directory: .\scripts\setup.ps1
# It will:
#   1. Check Node.js is installed
#   2. Prompt for server IP
#   3. Create .env.local with correct API URL
#   4. Install frontend dependencies
# ─────────────────────────────────────────────────────────────────

$ClientRoot = Split-Path $PSScriptRoot -Parent

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "    EurekaX Client Setup Script          " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# ── Step 1: Check prerequisites ───────────────────────────────────
Write-Host "[1/4] Checking prerequisites..." -ForegroundColor Yellow

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js not found! Please install from https://nodejs.org" -ForegroundColor Red
    exit 1
}
$nodeVersion = (node --version)
Write-Host "  Node.js found: $nodeVersion" -ForegroundColor Green

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "  npm not found! Please install Node.js" -ForegroundColor Red
    exit 1
}
Write-Host "  npm found" -ForegroundColor Green

# ── Step 2: Get server IP from user ───────────────────────────────
Write-Host ""
Write-Host "[2/4] Server Configuration" -ForegroundColor Yellow
$SERVER_IP = Read-Host "   Enter the SERVER's LAN IP address (e.g., 192.168.1.100)"

if (-not ($SERVER_IP -match '^\d+\.\d+\.\d+\.\d+$')) {
    Write-Host "  Invalid IP address format. Please re-run and enter a valid IP." -ForegroundColor Red
    exit 1
}
Write-Host "  Server IP set to: $SERVER_IP" -ForegroundColor Green

# Ask for connection mode
Write-Host ""
Write-Host "  Connection mode:" -ForegroundColor White
Write-Host "    [1] Simple (HTTP, port 8000) - recommended for testing" -ForegroundColor Gray
Write-Host "    [2] Secure (HTTPS, port 443) - requires TLS certs on server" -ForegroundColor Gray
$modeChoice = Read-Host "   Choose [1/2] (default: 1)"

if ($modeChoice -eq "2") {
    $protocol = "https"
    $wsProtocol = "wss"
    $port = ""
    $apiPort = "443"
    Write-Host "  Mode: Secure (HTTPS)" -ForegroundColor Green
} else {
    $protocol = "http"
    $wsProtocol = "ws"
    $port = ":8000"
    $apiPort = "8000"
    Write-Host "  Mode: Simple (HTTP)" -ForegroundColor Green
}

# ── Step 3: Create .env.local ─────────────────────────────────────
Write-Host ""
Write-Host "[3/4] Creating environment config..." -ForegroundColor Yellow

$frontendDir = Join-Path $ClientRoot "frontend"
$envContent = @"
NEXT_PUBLIC_SERVER_IP=$SERVER_IP
NEXT_PUBLIC_API_BASE=${protocol}://${SERVER_IP}${port}/api
NEXT_PUBLIC_STREAM_BASE=${protocol}://${SERVER_IP}${port}/api
NEXT_PUBLIC_WS_BASE=${wsProtocol}://${SERVER_IP}${port}/ws
NEXT_PUBLIC_APP_NAME=EurekaX
SERVER_API_PORT=$apiPort
"@

Set-Content -Path (Join-Path $frontendDir ".env.local") -Value $envContent
Write-Host "  .env.local created" -ForegroundColor Green

# Update server_info.json
$serverInfoPath = Join-Path $ClientRoot "config\server_info.json"
$serverInfo = Get-Content $serverInfoPath | ConvertFrom-Json
$serverInfo.server.ip = $SERVER_IP
$serverInfo.server.api_port = [int]$apiPort
$serverInfo.endpoints.api_base = "${protocol}://${SERVER_IP}${port}/api"
$serverInfo.endpoints.ws_base = "${wsProtocol}://${SERVER_IP}${port}/ws"
$serverInfo.endpoints.health = "${protocol}://${SERVER_IP}${port}/api/health"
$serverInfo.endpoints.login = "${protocol}://${SERVER_IP}${port}/api/auth/login"
$serverInfo | ConvertTo-Json -Depth 5 | Set-Content $serverInfoPath
Write-Host "  server_info.json updated" -ForegroundColor Green

# Update next.config.ts to use correct protocol
$nextConfigPath = Join-Path $frontendDir "next.config.ts"
$nextConfigContent = Get-Content $nextConfigPath -Raw
# The next.config.ts reads from NEXT_PUBLIC_SERVER_IP env var, so no changes needed
Write-Host "  next.config.ts will read from .env.local (no changes needed)" -ForegroundColor Green

# ── Step 4: Install frontend dependencies ─────────────────────────
Write-Host ""
Write-Host "[4/4] Installing frontend dependencies..." -ForegroundColor Yellow
Push-Location $frontendDir
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "  npm install failed!" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location
Write-Host "  Dependencies installed" -ForegroundColor Green

# ── Done ──────────────────────────────────────────────────────────
Write-Host ""
Write-Host "=========================================" -ForegroundColor Green
Write-Host "    Setup Complete!                      " -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
if ($modeChoice -eq "2") {
    Write-Host "  1. Copy ca.crt from server -> client\certs\ca.crt"
    Write-Host "  2. Run: .\scripts\trust_cert.ps1   (as Admin)"
}
Write-Host "  $(if ($modeChoice -eq '2') {'3'} else {'1'}). Run: .\scripts\test_connection.ps1"
Write-Host "  $(if ($modeChoice -eq '2') {'4'} else {'2'}). Run: .\scripts\start_client.ps1"
Write-Host ""
