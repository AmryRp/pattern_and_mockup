import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Vinext writes route types into .next; keep native Next.js output separate.
  distDir: '.next-vercel',
};

export default nextConfig;
