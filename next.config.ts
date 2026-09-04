import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* round 27: the three historical TS errors are fixed and `skills/` is
     excluded from tsconfig — type errors now FAIL the build again so real
     bugs can't silently ship (the ignoreBuildErrors crutch is gone). */
  reactStrictMode: false,
  // Prisma needs to be bundled for serverless deployment
  serverExternalPackages: ["@prisma/client", "@supabase/supabase-js", "@supabase/ssr"],
};

export default nextConfig;
