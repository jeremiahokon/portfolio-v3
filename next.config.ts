import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
      },
    ],
  },
  // @huggingface/transformers reads `import.meta` directly to locate its wasm
  // assets. webpack cannot statically analyse that and warns, but the code path
  // is only reached in the browser where `import.meta` is real — the warning has
  // no failure behind it, so it is silenced for that module alone rather than
  // globally.
  // `next dev` runs Turbopack, which does not read the `webpack` hook below and
  // warns about it unless it has a config of its own. Turbopack does not emit the
  // import.meta warning in the first place, so an empty object is the whole fix.
  turbopack: {},

  webpack(config) {
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      {
        module: /@huggingface[\\/]transformers/,
        message: /Accessing import\.meta directly is unsupported/,
      },
    ];

    return config;
  },

  // NOTE: The audio extractor uses the single-threaded @ffmpeg/core, which does
  // not use SharedArrayBuffer and therefore needs NO cross-origin isolation
  // (COOP/COEP/CORP) headers. Adding require-corp back would re-introduce the
  // Vercel module-worker block that hung the extractor in production — leave it
  // off unless the tool is switched back to the multi-threaded core.
};

export default nextConfig;
