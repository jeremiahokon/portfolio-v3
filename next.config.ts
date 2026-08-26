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
  // warns about it unless it has a config of its own — but an *empty* object
  // does not count. Next's turbopack-warning check flattens this config into a
  // list of dotted keys and looks for one starting with "turbopack"; flattening
  // `{}` yields zero keys (nothing to iterate), so `turbopack: {}` is silently
  // indistinguishable from no `turbopack` key at all and the warning still
  // fires. `root` is a real, documented TurbopackOptions field, and pointing it
  // at the project root (already the default resolution root for this
  // single-app repo) gives the check a genuine key to find without changing
  // any actual resolution behavior.
  turbopack: {
    root: process.cwd(),
  },

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
