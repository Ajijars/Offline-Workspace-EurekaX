# ─────────────────────────────────────────────────────────────────
# test_connection.ps1 — Test Connection to EurekaX Server
# ─────────────────────────────────────────────────────────────────
# Runs a series of checks to verify the client can connect to the
# server. Automatically detects HTTP vs HTTPS mode from config.
# ─────────────────────────────────────────────────────────────────

# Load server info
$ClientRoot = Split-Path $PSScriptRoot -Parent
$configPath = Join-Path $ClientRoot "config\server_info.json"

if (-not (Test-Path $configPath)) {
    Write-Host "❌ server_info.json not found. Run setup.ps1 first." -ForegroundColor Red
    exit 1
}
$config = Get-Content $configPath | ConvertFrom-Json
$SERVER_IP = $config.server.ip
$HEALTH_URL = $config.endpoints.health
$API_PORT = $config.server.api_port

# Detect if HTTPS or HTTP mode
$isHTTPS = $HEALTH_URL.StartsWith("https://")

Write-Host ""
Write-Host "🔍 EurekaX — Connection Test" -ForegroundColor Cyan
Write-Host "────────────────────────────" -ForegroundColor Cyan
Write-Host "   Target Server: $SERVER_IP" -ForegroundColor White
Write-Host "   Mode:          $(if ($isHTTPS) {'HTTPS (Secure)'} else {'HTTP (Simple)'})" -ForegroundColor White
Write-Host "   Health URL:    $HEALTH_URL" -ForegroundColor White
Write-Host ""

# ── Test 1: Ping the server ───────────────────────────────────────
Write-Host "[Test 1] Ping server..." -ForegroundColor Yellow
$ping = Test-Connection -ComputerName $SERVER_IP -Count 2 -Quiet
if ($ping) {
    Write-Host "✅ Server is reachable on network (ping OK)" -ForegroundColor Green
} else {
    Write-Host "❌ Cannot ping server at $SERVER_IP" -ForegroundColor Red
    Write-Host "   Check: WiFi connected? Server powered on? Firewall?" -ForegroundColor Yellow
}

# ── Test 2: Check the correct port ────────────────────────────────
Write-Host ""
if ($isHTTPS) {
    $testPort = 443
    Write-Host "[Test 2] Checking HTTPS port ($testPort)..." -ForegroundColor Yellow
} else {
    $testPort = $API_PORT
    Write-Host "[Test 2] Checking API port ($testPort)..." -ForegroundColor Yellow
}
$tcpTest = Test-NetConnection -ComputerName $SERVER_IP -Port $testPort -WarningAction SilentlyContinue
if ($tcpTest.TcpTestSucceeded) {
    Write-Host "✅ Port $testPort is open" -ForegroundColor Green
} else {
    Write-Host "❌ Port $testPort is not reachable" -ForegroundColor Red
    if ($isHTTPS) {
        Write-Host "   Check: Is Nginx running on server? Firewall blocking $testPort?" -ForegroundColor Yellow
    } else {
        Write-Host "   Check: Is uvicorn running on server? Firewall blocking $testPort?" -ForegroundColor Yellow
        Write-Host "   Server command: uvicorn app.main:app --host 0.0.0.0 --port $API_PORT" -ForegroundColor Gray
    }
}

# ── Test 3: Health check ──────────────────────────────────────────
Write-Host ""
Write-Host "[Test 3] API health check..." -ForegroundColor Yellow
try {
    if ($isHTTPS) {
        $response = Invoke-RestMethod -Uri $HEALTH_URL -Method GET -TimeoutSec 10
    } else {
        $response = Invoke-RestMethod -Uri $HEALTH_URL -Method GET -TimeoutSec 10
    }
    Write-Host "✅ API connection successful!" -ForegroundColor Green
    Write-Host "   Response: $($response | ConvertTo-Json -Compress)" -ForegroundColor Gray
} catch {
    Write-Host "⚠️  API request failed: $_" -ForegroundColor Yellow
    if ($isHTTPS) {
        Write-Host "   If you see SSL error → run scripts\trust_cert.ps1" -ForegroundColor Yellow
        Write-Host "   Trying with cert verification skipped..." -ForegroundColor Gray
        try {
            $response = Invoke-RestMethod -Uri $HEALTH_URL -Method GET -TimeoutSec 10 -SkipCertificateCheck
            Write-Host "⚠️  Connected (but cert not trusted yet — run trust_cert.ps1!)" -ForegroundColor Yellow
        } catch {
            Write-Host "❌ Cannot reach server API at $HEALTH_URL" -ForegroundColor Red
        }
    } else {
        Write-Host "❌ Cannot reach server API at $HEALTH_URL" -ForegroundColor Red
        Write-Host "   Make sure the server is running:" -ForegroundColor Yellow
        Write-Host "     uvicorn app.main:app --host 0.0.0.0 --port $API_PORT" -ForegroundColor Gray
        Write-Host "   And Windows Firewall allows port $API_PORT" -ForegroundColor Yellow
    }
}

# ── Test 4: TLS Version Check (HTTPS only) ────────────────────────
if ($isHTTPS) {
    Write-Host ""
    Write-Host "[Test 4] TLS version check..." -ForegroundColor Yellow
    try {
        $tcpClient = New-Object System.Net.Sockets.TcpClient($SERVER_IP, 443)
        $sslStream = New-Object System.Net.Security.SslStream($tcpClient.GetStream(), $false)
        $sslStream.AuthenticateAsClient($SERVER_IP)
        $tlsVersion = $sslStream.SslProtocol
        Write-Host "✅ TLS Version: $tlsVersion" -ForegroundColor Green
        $sslStream.Close()
        $tcpClient.Close()
    } catch {
        Write-Host "⚠️  Could not verify TLS version: $_" -ForegroundColor Yellow
    }
} else {
    Write-Host ""
    Write-Host "[Test 4] TLS check skipped (HTTP mode)" -ForegroundColor Gray
}

# ── Summary ───────────────────────────────────────────────────────
Write-Host ""
Write-Host "────────────────────────────" -ForegroundColor Cyan
Write-Host "Connection test complete!" -ForegroundColor Cyan
Write-Host "If all tests passed ✅ → Run: .\scripts\start_client.ps1" -ForegroundColor White
Write-Host ""
