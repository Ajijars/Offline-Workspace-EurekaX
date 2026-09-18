# EurekaX — Client PC Package

This folder contains **everything needed to run the client** (frontend) on a separate PC
connected to the EurekaX server over a **secure WiFi LAN**.

---

## 📁 Folder Structure

```
client/
├── README.md                 ← You are here
├── config/
│   ├── .env.client           ← Client environment variables (SERVER IP, ports)
│   └── server_info.json      ← Server connection info (IP, cert fingerprint)
├── certs/
│   ├── ca.crt                ← CA certificate (copy from server after setup)
│   └── README_CERTS.md       ← How to get certs from server
├── nginx/
│   ├── nginx.conf            ← Nginx reverse proxy config for client-side
│   └── Dockerfile            ← (Optional) Run nginx in Docker
├── frontend/                 ← Copy of the Next.js frontend app
│   ├── package.json
│   ├── next.config.ts        ← Points to server IP (not localhost)
│   └── ... (rest of frontend files)
└── scripts/
    ├── setup.ps1             ← One-click Windows setup script
    ├── start_client.ps1      ← Start the client app
    ├── trust_cert.ps1        ← Install server CA cert to Windows trust store
    └── test_connection.ps1   ← Test secure connection to server
```

---

## 🚀 Quick Start (Client PC Setup)

### Step 1: Get the server IP
Ask the server admin for the server's **local IP address** (e.g., `192.168.1.100`).

### Step 2: Configure connection
Edit `config/.env.client`:
```
SERVER_IP=192.168.1.100
SERVER_PORT=8000
```

### Step 3: Trust the server certificate
```powershell
.\scripts\trust_cert.ps1
```

### Step 4: Test connection
```powershell
.\scripts\test_connection.ps1
```

### Step 5: Start the client
```powershell
.\scripts\start_client.ps1
```

---

## 🔒 Security Notes

- All communication uses **HTTPS (TLS 1.3)**
- JWT tokens are stored in localStorage (short-lived, auto-refreshed)
- Never share the `ca.crt` publicly — it's only for internal LAN use
- The server IP is hardcoded in `.env.client` — update if server IP changes
