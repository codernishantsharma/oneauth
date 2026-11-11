import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Codespaces can forward requests with the public host while the browser
      // still sends localhost as Origin during local development.
      ...(process.env.NODE_ENV === "development"
        ? { allowedOrigins: ["localhost:3001", "*.app.github.dev"] }
        : {}),
    },
  },
};

export default nextConfig;
