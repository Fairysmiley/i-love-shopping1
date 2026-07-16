import type { NextConfig } from "next";
import path from "path";
import { config as loadEnv } from "dotenv";

// In local dev, load root .env so DATABASE_URL matches the seed (same DB)
if (!process.env.DATABASE_URL) {
  loadEnv({ path: path.resolve(process.cwd(), "../../.env") });
}

const nextConfig: NextConfig = {
  // Enable standalone output for Docker
  output: "standalone",

  // Monorepo root for Turbopack (avoid wrong root from parent lockfiles)
  turbopack: { root: path.resolve(__dirname, "../..") },

  // Fix Prisma client bundling issues and prevent bundling of Node.js-only packages
  serverExternalPackages: ["@prisma/client", "otplib", "qrcode"],

  // Transpile workspace packages to ensure proper module resolution
  transpilePackages: ["@wellness-app/server", "@wellness-app/shared"],
};

export default nextConfig;
