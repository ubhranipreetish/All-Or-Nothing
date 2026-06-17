import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // This app lives in a multi-package repo (aon-client + aon-server) with no
  // lockfile at the repo root. Without an explicit root, Next/Turbopack infers
  // the repo root as the workspace and then fails to resolve modules like
  // `tailwindcss` (which live in aon-client/node_modules). Pin the root here.
  turbopack: {
    root: path.join(__dirname),
  },
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
