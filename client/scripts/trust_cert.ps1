# ─────────────────────────────────────────────────────────────────
# trust_cert.ps1 — Install Server CA Certificate
# Run as Administrator!
# ─────────────────────────────────────────────────────────────────
# This installs the server's self-signed CA certificate into
# Windows' Trusted Root Certification Authorities store.
# After this, browsers will trust the server's HTTPS connection.
# ─────────────────────────────────────────────────────────────────

param (
    [string]$CertPath = "..\certs\ca.crt"
)

Write-Host ""
Write-Host "🔐 EurekaX — Trust Server Certificate" -ForegroundColor Cyan
Write-Host "─────────────────────────────────────" -ForegroundColor Cyan

# Check admin privileges
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")
if (-not $isAdmin) {
    Write-Host "❌ Please run this script as Administrator!" -ForegroundColor Red
    Write-Host "   Right-click PowerShell → 'Run as administrator'" -ForegroundColor Yellow
    exit 1
}

# Resolve path
$resolvedPath = Resolve-Path $CertPath -ErrorAction SilentlyContinue
if (-not $resolvedPath) {
    Write-Host "❌ Certificate not found at: $CertPath" -ForegroundColor Red
    Write-Host "   Please copy ca.crt from the server to .\certs\ca.crt first." -ForegroundColor Yellow
    exit 1
}

Write-Host "📄 Certificate path: $resolvedPath" -ForegroundColor White

# Show cert info
try {
    $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($resolvedPath.Path)
    Write-Host "   Subject:    $($cert.Subject)" -ForegroundColor Gray
    Write-Host "   Issuer:     $($cert.Issuer)" -ForegroundColor Gray
    Write-Host "   Valid From: $($cert.NotBefore)" -ForegroundColor Gray
    Write-Host "   Valid To:   $($cert.NotAfter)" -ForegroundColor Gray
    Write-Host "   Thumbprint: $($cert.Thumbprint)" -ForegroundColor Gray
} catch {
    Write-Host "⚠️  Could not read cert details: $_" -ForegroundColor Yellow
}

Write-Host ""
$confirm = Read-Host "Install this certificate? (yes/no)"
if ($confirm -ne "yes") {
    Write-Host "Cancelled." -ForegroundColor Yellow
    exit 0
}

# Install to Trusted Root store
try {
    $store = New-Object System.Security.Cryptography.X509Certificates.X509Store(
        [System.Security.Cryptography.X509Certificates.StoreName]::Root,
        [System.Security.Cryptography.X509Certificates.StoreLocation]::LocalMachine
    )
    $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
    $store.Add($cert)
    $store.Close()

    Write-Host ""
    Write-Host "✅ Certificate installed successfully!" -ForegroundColor Green
    Write-Host "   Browsers will now trust the EurekaX server's HTTPS connection." -ForegroundColor Green
    Write-Host "   Note: You may need to restart your browser for changes to take effect." -ForegroundColor Yellow
} catch {
    Write-Host "❌ Failed to install certificate: $_" -ForegroundColor Red
    exit 1
}
