import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Proxy API + WebSocket requests to the FastAPI backend during development.
   * In production, configure a reverse proxy (nginx, etc.) instead.
   */
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/api/:path*',
      },
      {
        source: '/ws/:path*',
        destination: 'http://localhost:8000/ws/:path*',
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
