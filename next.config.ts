import type { NextConfig } from "next";

type RemotePattern = {
  protocol: "http" | "https";
  hostname: string;
  pathname: string;
};

const supabaseStorageUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const remotePatterns: RemotePattern[] = [
  // CollectorCrypt / gacha card artwork (imported product images).
  {
    protocol: "https",
    hostname: "d1xpxki1g4htqu.cloudfront.net",
    pathname: "/**",
  },
];

if (supabaseStorageUrl) {
  try {
    const url = new URL(supabaseStorageUrl);
    remotePatterns.push({
      protocol: url.protocol.replace(":", "") as "http" | "https",
      hostname: url.hostname,
      pathname: "/storage/v1/object/public/**",
    });
  } catch {
    // Ignore invalid env values and let runtime validation surface the issue elsewhere.
  }
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    remotePatterns,
  },
};

export default nextConfig;
