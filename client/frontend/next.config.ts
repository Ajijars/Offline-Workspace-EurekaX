import type { NextConfig } from "next";

/**
 * Next.js config for CLIENT PC deployment.
 *
 * When running on a separate client machine, the server is at a LAN IP.
 * Replace SERVER_IP with the actual server's local IP address.
 *
 * The SERVER_IP is read from environment variable NEXT_PUBLIC_SERVER_IP,
 * which is set in .env.client → .env.local
 */

const SERVER_IP = process.env.NEXT_PUBLIC_SERVER_IP || "192.168.1.100";
const SERVER_API_PORT = process.env.SERVER_API_PORT || "8000";

const nextConfig: NextConfig = {
  /**
   * Proxy all /api requests to the actual server over HTTPS.
   * Nginx on the server handles SSL termination.
   */
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `https://${SERVER_IP}/api/:path*`,
      },
      {
        source: "/ws/:path*",
        destination: `wss://${SERVER_IP}/ws/:path*`,
      },
    ];
  },

  /**
   * Security Headers added to every response
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: `
              default-src 'self';
              script-src 'self' 'unsafe-eval' 'unsafe-inline';
              style-src 'self' 'unsafe-inline';
              connect-src 'self' https://${SERVER_IP} wss://${SERVER_IP};
              img-src 'self' data: blob: https://${SERVER_IP};
              font-src 'self';
            `
              .replace(/\s+/g, " ")
              .trim(),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
