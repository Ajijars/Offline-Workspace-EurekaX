# ─────────────────────────────────────────────────────────────────
# EurekaX Client — One-Click Setup Script (Windows PowerShell)
# ─────────────────────────────────────────────────────────────────
# Run this as Administrator on the client PC.
# It will:
#   1. Check Node.js is installed
#   2. Copy .env.local.example -> .env.local
#   3. Install frontend dependencies
#   4. Prompt for server IP and update config files
# ─────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║       EurekaX Client Setup Script            ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── Step 1: Check prerequisites ───────────────────────────────────
Write-Host "[1/5] Checking prerequisites..." -ForegroundColor Yellow

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js not found! Please install from https://nodejs.org" -ForegroundColor Red
    exit 1
}
$nodeVersion = (node --version)
Write-Host "✅ Node.js found: $nodeVersion" -ForegroundColor Green

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "❌ npm not found! Please install Node.js" -ForegroundColor Red
    exit 1
}
Write-Host "✅ npm found" -ForegroundColor Green

# ── Step 2: Get server IP from user ───────────────────────────────
Write-Host ""
Write-Host "[2/5] Server Configuration" -ForegroundColor Yellow
$SERVER_IP = Read-Host "   Enter the SERVER's LAN IP address (e.g., 192.168.1.100)"

if (-not ($SERVER_IP -match '^\d+\.\d+\.\d+\.\d+$')) {
    Write-Host "❌ Invalid IP address format. Please re-run and enter a valid IP." -ForegroundColor Red
    exit 1
}
Write-Host "✅ Server IP set to: $SERVER_IP" -ForegroundColor Green

# ── Step 3: Create .env.local ─────────────────────────────────────
Write-Host ""
Write-Host "[3/5] Creating environment config..." -ForegroundColor Yellow

$envContent = @"
NEXT_PUBLIC_SERVER_IP=$SERVER_IP
NEXT_PUBLIC_API_BASE=https://$SERVER_IP/api
NEXT_PUBLIC_WS_BASE=wss://$SERVER_IP/ws
NEXT_PUBLIC_APP_NAME=EurekaX
SERVER_API_PORT=8000
"@

Set-Content -Path ".\frontend\.env.local" -Value $envContent
Write-Host "✅ .env.local created" -ForegroundColor Green

# Update server_info.json
$serverInfo = Get-Content ".\config\server_info.json" | ConvertFrom-Json
$serverInfo.server.ip = $SERVER_IP
$serverInfo.endpoints.api_base = "https://$SERVER_IP/api"
$serverInfo.endpoints.ws_base = "wss://$SERVER_IP/ws"
$serverInfo.endpoints.health = "https://$SERVER_IP/api/health"
$serverInfo.endpoints.login = "https://$SERVER_IP/api/auth/login"
$serverInfo | ConvertTo-Json -Depth 5 | Set-Content ".\config\server_info.json"
Write-Host "✅ server_info.json updated" -ForegroundColor Green

# ── Step 4: Install frontend dependencies ─────────────────────────
Write-Host ""
Write-Host "[4/5] Installing frontend dependencies..." -ForegroundColor Yellow
Set-Location frontend
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ npm install failed!" -ForegroundColor Red
    exit 1
}
Set-Location ..
Write-Host "✅ Dependencies installed" -ForegroundColor Green

# ── Step 5: Check for CA certificate ─────────────────────────────
Write-Host ""
Write-Host "[5/5] Checking certificates..." -ForegroundColor Yellow

if (-not (Test-Path ".\certs\ca.crt")) {
    Write-Host "⚠️  ca.crt NOT found in .\certs\" -ForegroundColor Yellow
    Write-Host "   Please copy ca.crt from the server and run:" -ForegroundColor Yellow
    Write-Host "   .\scripts\trust_cert.ps1" -ForegroundColor White
} else {
    Write-Host "✅ ca.crt found — run .\scripts\trust_cert.ps1 to install it" -ForegroundColor Green
}

# ── Done ──────────────────────────────────────────────────────────
Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║         ✅ Setup Complete!                    ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Copy ca.crt from server → .\certs\ca.crt"
Write-Host "  2. Run: .\scripts\trust_cert.ps1   (as Admin)"
Write-Host "  3. Run: .\scripts\test_connection.ps1"
Write-Host "  4. Run: .\scripts\start_client.ps1"
Write-Host ""
