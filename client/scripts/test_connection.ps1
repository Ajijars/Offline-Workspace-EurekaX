# ─────────────────────────────────────────────────────────────────
# test_connection.ps1 — Test Secure Connection to EurekaX Server
# ─────────────────────────────────────────────────────────────────
# Runs a series of checks to verify the client can securely
# connect to the server over HTTPS/WSS.
# ─────────────────────────────────────────────────────────────────

# Load server info
$configPath = "..\config\server_info.json"
if (-not (Test-Path $configPath)) {
    Write-Host "❌ server_info.json not found. Run setup.ps1 first." -ForegroundColor Red
    exit 1
}
$config = Get-Content $configPath | ConvertFrom-Json
$SERVER_IP = $config.server.ip
$HEALTH_URL = $config.endpoints.health

Write-Host ""
Write-Host "🔍 EurekaX — Connection Test" -ForegroundColor Cyan
Write-Host "────────────────────────────" -ForegroundColor Cyan
Write-Host "   Target Server: $SERVER_IP" -ForegroundColor White
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

# ── Test 2: Port 443 open? ────────────────────────────────────────
Write-Host ""
Write-Host "[Test 2] Checking HTTPS port (443)..." -ForegroundColor Yellow
$tcpTest = Test-NetConnection -ComputerName $SERVER_IP -Port 443 -WarningAction SilentlyContinue
if ($tcpTest.TcpTestSucceeded) {
    Write-Host "✅ Port 443 (HTTPS) is open" -ForegroundColor Green
} else {
    Write-Host "❌ Port 443 is not reachable" -ForegroundColor Red
    Write-Host "   Check: Is Nginx running on server? Firewall blocking 443?" -ForegroundColor Yellow
}

# ── Test 3: HTTPS health check ────────────────────────────────────
Write-Host ""
Write-Host "[Test 3] HTTPS health check..." -ForegroundColor Yellow
try {
    # Use -SkipCertificateCheck only if ca.crt not yet trusted
    $response = Invoke-RestMethod -Uri $HEALTH_URL -Method GET -TimeoutSec 10
    Write-Host "✅ HTTPS connection successful!" -ForegroundColor Green
    Write-Host "   Response: $($response | ConvertTo-Json -Compress)" -ForegroundColor Gray
} catch {
    Write-Host "⚠️  HTTPS request failed: $_" -ForegroundColor Yellow
    Write-Host "   If you see SSL error → run scripts\trust_cert.ps1" -ForegroundColor Yellow
    Write-Host "   Trying with cert verification skipped..." -ForegroundColor Gray
    try {
        $response = Invoke-RestMethod -Uri $HEALTH_URL -Method GET -TimeoutSec 10 -SkipCertificateCheck
        Write-Host "⚠️  Connected (but cert not trusted yet — run trust_cert.ps1!)" -ForegroundColor Yellow
    } catch {
        Write-Host "❌ Cannot reach server API at $HEALTH_URL" -ForegroundColor Red
    }
}

# ── Test 4: TLS Version Check ─────────────────────────────────────
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

# ── Summary ───────────────────────────────────────────────────────
Write-Host ""
Write-Host "────────────────────────────" -ForegroundColor Cyan
Write-Host "Connection test complete!" -ForegroundColor Cyan
Write-Host "If all tests passed ✅ → Run: .\scripts\start_client.ps1" -ForegroundColor White
Write-Host ""
