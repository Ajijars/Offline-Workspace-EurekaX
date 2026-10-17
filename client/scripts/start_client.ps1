# ─────────────────────────────────────────────────────────────────
# start_client.ps1 — Start EurekaX Client App
# ─────────────────────────────────────────────────────────────────
# Run from the client/ directory: .\scripts\start_client.ps1

$ClientRoot = Split-Path $PSScriptRoot -Parent

Write-Host ""
Write-Host "Starting EurekaX Client..." -ForegroundColor Cyan

# Load config
$configPath = Join-Path $ClientRoot "config\server_info.json"
if (-not (Test-Path $configPath)) {
    Write-Host "server_info.json not found. Run setup.ps1 first." -ForegroundColor Red
    exit 1
}
$config = Get-Content $configPath | ConvertFrom-Json
$SERVER_IP = $config.server.ip

Write-Host "   Connecting to server: $SERVER_IP" -ForegroundColor White
Write-Host "   Client running at:    http://localhost:3000" -ForegroundColor White
Write-Host ""

# Check frontend exists
$frontendDir = Join-Path $ClientRoot "frontend"
if (-not (Test-Path (Join-Path $frontendDir "package.json"))) {
    Write-Host "frontend/ not found. Please run setup.ps1 first." -ForegroundColor Red
    exit 1
}

# Check .env.local
$envLocal = Join-Path $frontendDir ".env.local"
if (-not (Test-Path $envLocal)) {
    Write-Host ".env.local not found. Creating from server_info..." -ForegroundColor Yellow
    
    # Detect whether to use http or https based on config
    $protocol = "http"
    $wsProtocol = "ws"
    $port = ":$($config.server.api_port)"
    
    if ($config.tls.verify -eq $true -and (Test-Path (Join-Path $ClientRoot "certs\ca.crt"))) {
        $protocol = "https"
        $wsProtocol = "wss"
        $port = ""  # HTTPS usually on 443 via nginx
    }
    
    @"
NEXT_PUBLIC_SERVER_IP=$SERVER_IP
NEXT_PUBLIC_API_BASE=${protocol}://${SERVER_IP}${port}/api
NEXT_PUBLIC_STREAM_BASE=${protocol}://${SERVER_IP}${port}/api
NEXT_PUBLIC_WS_BASE=${wsProtocol}://${SERVER_IP}${port}/ws
NEXT_PUBLIC_APP_NAME=EurekaX
SERVER_API_PORT=$($config.server.api_port)
"@ | Set-Content $envLocal
    Write-Host ".env.local created" -ForegroundColor Green
}

# Check node_modules
$nodeModules = Join-Path $frontendDir "node_modules"
if (-not (Test-Path $nodeModules)) {
    Write-Host "Installing dependencies (first run)..." -ForegroundColor Yellow
    Push-Location $frontendDir
    npm install
    Pop-Location
    Write-Host "Dependencies installed" -ForegroundColor Green
}

# Start Next.js
Write-Host "Starting Next.js development server..." -ForegroundColor Yellow
Push-Location $frontendDir
npm run dev
Pop-Location
