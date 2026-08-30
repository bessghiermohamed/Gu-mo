import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Prisma needs to be bundled for serverless deployment
  serverExternalPackages: ["@prisma/client", "@supabase/supabase-js", "@supabase/ssr"],
};

export default nextConfig;
