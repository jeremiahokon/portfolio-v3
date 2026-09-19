import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
      },
    ],
    // `quality={90}` is used on a few `<Image>`s; Next 16 defaults
    // `images.qualities` to `[75]` and coerces anything else to the nearest
    // allowed value, so 90 needs to stay listed explicitly.
    qualities: [75, 90],
  },

  // NOTE: The audio extractor uses the single-threaded @ffmpeg/core, which does
  // not use SharedArrayBuffer and therefore needs NO cross-origin isolation
  // (COOP/COEP/CORP) headers. Adding require-corp back would re-introduce the
  // Vercel module-worker block that hung the extractor in production — leave it
  // off unless the tool is switched back to the multi-threaded core.
};

export default nextConfig;
