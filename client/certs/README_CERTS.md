# 🔐 Certificates — Client Setup

## What is this folder?

This folder holds the **CA (Certificate Authority) certificate** from the server.
This certificate is needed so your browser/client trusts the server's HTTPS connection.

---

## How to get `ca.crt` from the server?

### Method 1: Copy via USB / shared drive
On the **server machine**, the cert is at:
```
C:\EurekaX_Project\server\certs\ca.crt
```
Copy it here:
```
C:\EurekaX_Project\client\certs\ca.crt
```

### Method 2: Copy over network (SCP)
```bash
# Run on client machine (replace SERVER_IP):
scp user@192.168.1.100:C:/EurekaX_Project/server/certs/ca.crt ./certs/ca.crt
```

### Method 3: Via shared folder
If the server has a shared folder, copy the file from:
```
\\SERVER_IP\certs\ca.crt
```

---

## After copying ca.crt — Install it!

Run this on the **client PC** (as Administrator):
```powershell
.\scripts\trust_cert.ps1
```

This adds the CA cert to Windows' Trusted Root Certificates so your browser
will **not** show "This connection is not private" warnings.

---

## ⚠️ Important Notes
- `ca.crt` is NOT included in the repo for security
- Only distribute it via trusted channels (USB, internal network)
- Never upload `ca.crt` to GitHub or any public service
- The cert is only valid on your **local LAN** — it does NOT work on the internet
