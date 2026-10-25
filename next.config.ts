import type { NextConfig } from "next";

// Security headers on every response. The CSP is written for what the app really loads:
//  - scripts: Next's own (inline bootstrap needs 'unsafe-inline' because pages are prerendered, so no nonce),
//    the ElevenLabs audio worklets (blob:), and WebAssembly for the manifold module ('wasm-unsafe-eval');
//    dev also needs 'unsafe-eval' (React debugging), production does not
//  - images/textures: self, data: and blob: (stored photos, WebGL textures)
//  - connect: self plus ElevenLabs (https for the signed URL, wss for the call)
const dev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob: data:",
  `connect-src 'self' data: blob: https://*.elevenlabs.io wss://*.elevenlabs.io${dev ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  /* config options here */
  // A separate build folder lets a production check run beside a dev server (NEXT_DIST_DIR=.next-check)
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=()" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
