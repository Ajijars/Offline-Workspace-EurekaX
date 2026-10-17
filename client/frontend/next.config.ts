import type { NextConfig } from "next";

const serverHost = process.env.SERVER_IP || process.env.NEXT_PUBLIC_SERVER_IP || "localhost";
const serverPort = process.env.SERVER_API_PORT || process.env.SERVER_PORT || "8000";

const nextConfig: NextConfig = {
  /**
   * Proxy API + WebSocket requests to the FastAPI backend during development.
   * Dynamically routes to the server PC host/IP configured in .env.local or environment.
   */
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `http://${serverHost}:${serverPort}/api/:path*`,
      },
      {
        source: '/ws/:path*',
        destination: `http://${serverHost}:${serverPort}/ws/:path*`,
      },
    ];
  },

  // Increase server-side timeout for proxied requests.
  // Default is 30s which causes 504 errors for Ollama model loading.
  serverExternalPackages: [],
  experimental: {
    proxyTimeout: 600_000,  // 10 minutes — matches backend Ollama read timeout
  },
};

export default nextConfig;
