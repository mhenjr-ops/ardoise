import type { NextConfig } from "next";

// Cache Components is off on purpose: every page in this LMS is behind a
// login and reads the session, so a static shell buys little. Turning it
// on later means wrapping session reads in <Suspense> (see README).
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    serverActions: {
      // Student uploads go straight to Supabase Storage from the browser;
      // this limit only covers ordinary form posts.
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
