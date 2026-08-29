import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained .next/standalone build (minimal node_modules
  // subset + a server.js entrypoint) for the Cloud Run Docker image.
  output: "standalone",
};

export default nextConfig;
