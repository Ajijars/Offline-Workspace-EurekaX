# ─────────────────────────────────────────────────────────────────
# start_client.ps1 — Start EurekaX Client App
# ─────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "🚀 Starting EurekaX Client..." -ForegroundColor Cyan

# Load config
$configPath = "..\config\server_info.json"
$config = Get-Content $configPath | ConvertFrom-Json
$SERVER_IP = $config.server.ip

Write-Host "   Connecting to server: $SERVER_IP" -ForegroundColor White
Write-Host "   Client running at:    http://localhost:3000" -ForegroundColor White
Write-Host ""

# Check frontend exists
if (-not (Test-Path "..\frontend\package.json")) {
    Write-Host "❌ frontend/ not found. Please copy the frontend files first." -ForegroundColor Red
    exit 1
}

# Check .env.local
if (-not (Test-Path "..\frontend\.env.local")) {
    Write-Host "⚠️  .env.local not found. Creating from server_info..." -ForegroundColor Yellow
    @"
NEXT_PUBLIC_SERVER_IP=$SERVER_IP
NEXT_PUBLIC_API_BASE=https://$SERVER_IP/api
NEXT_PUBLIC_WS_BASE=wss://$SERVER_IP/ws
NEXT_PUBLIC_APP_NAME=EurekaX
SERVER_API_PORT=8000
"@ | Set-Content "..\frontend\.env.local"
    Write-Host "✅ .env.local created" -ForegroundColor Green
}

# Start Next.js
Set-Location ..\frontend
Write-Host "Starting Next.js development server..." -ForegroundColor Yellow
npm run dev
