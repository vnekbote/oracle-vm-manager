import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Keep native crypto and OCI SDKs server-side only.
  serverExternalPackages: ["@node-rs/argon2", "oci-common", "oci-core"],
};

export default nextConfig;
