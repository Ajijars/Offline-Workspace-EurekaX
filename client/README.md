# EurekaX — Client PC Package

This folder contains **everything needed to run the client** (frontend) on a separate PC
connected to the EurekaX server over a **WiFi LAN**.

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
│   └── nginx.conf            ← Nginx reverse proxy config (optional, for HTTPS)
├── frontend/                 ← Full Next.js frontend app
│   ├── package.json          ← Dependencies (run npm install)
│   ├── next.config.ts        ← Points to server IP (not localhost)
│   ├── tsconfig.json
│   └── src/                  ← All React components, pages, hooks, stores
│       ├── app/              ← Next.js App Router pages
│       ├── components/       ← Chat, RAG, Agent, Auth, Layout components
│       ├── hooks/            ← useChat, useDocuments, useHealth
│       ├── lib/              ← api.ts, auth.ts, constants.ts, types.ts
│       └── stores/           ← Zustand state management
└── scripts/
    ├── setup.ps1             ← One-click Windows setup script
    ├── start_client.ps1      ← Start the client app
    ├── trust_cert.ps1        ← Install server CA cert to Windows trust store
    └── test_connection.ps1   ← Test connection to server
```

---

## 🚀 Quick Start (Client PC Setup)

### Prerequisites
- **Node.js 18+** installed on the client PC
- Both PCs connected to the **same WiFi / LAN**

### Step 1: Get the server IP
On the **server PC**, run:
```powershell
ipconfig
```
Look for the **IPv4 Address** under your active WiFi adapter (e.g., `192.168.1.100`).

### Step 2: Run the setup script
```powershell
cd client
.\scripts\setup.ps1
```
This will:
- Check Node.js is installed
- Ask you for the server IP address
- Create `.env.local` with the correct API base URL
- Install frontend dependencies (`npm install`)

### Step 3: (Optional) Trust the server certificate
Only needed if the server is running with HTTPS/TLS:
```powershell
.\scripts\trust_cert.ps1
```

### Step 4: Test the connection
```powershell
.\scripts\test_connection.ps1
```

### Step 5: Start the client
```powershell
.\scripts\start_client.ps1
```
Open **http://localhost:3000** on the client PC.

---

## 🔧 Simple Mode (No HTTPS)

If you're running on a **trusted private LAN** and don't need TLS:

1. On the **server PC**, start the backend:
   ```powershell
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

2. On the **client PC**, edit `frontend/.env.local`:
   ```
   NEXT_PUBLIC_SERVER_IP=<SERVER_IP>
   NEXT_PUBLIC_API_BASE=http://<SERVER_IP>:8000/api
   NEXT_PUBLIC_WS_BASE=ws://<SERVER_IP>:8000/ws
   NEXT_PUBLIC_APP_NAME=EurekaX
   SERVER_API_PORT=8000
   ```

3. Start the frontend:
   ```powershell
   cd frontend
   npm run dev
   ```

---

## 🔒 Secure Mode (HTTPS + TLS)

For production or when security is critical:

1. Install `mkcert` on the **server PC** and generate certs
2. Start the server with SSL:
   ```powershell
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --ssl-keyfile localhost-key.pem --ssl-certfile localhost.pem
   ```
3. Copy the CA cert to `client/certs/ca.crt`
4. Run `.\scripts\trust_cert.ps1` on the client PC
5. Update `.env.local` to use `https://` and `wss://`

---

## 🔒 Security Notes

- All communication can use **HTTPS (TLS 1.3)** when configured
- JWT tokens are stored in localStorage (short-lived, auto-refreshed)
- Rate limiting is enforced on login (10/min) and register (5/min)
- Never share the `ca.crt` publicly — it's only for internal LAN use
- The server IP is configured in `.env.local` — update if server IP changes
