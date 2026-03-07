import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.tubetext.app" }],
        destination: "https://tubetext.app/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
