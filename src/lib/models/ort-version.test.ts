import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { ORT_VERSION, ORT_WASM_PATH } from './config';

/**
 * Guards the one way pointing ORT at a CDN can break silently.
 *
 * `wasmPaths` makes the runtime fetch its `.wasm` and `.mjs` factory from a pinned
 * version on jsdelivr, while the main ORT JavaScript is still bundled from
 * `node_modules`. Those two must be the same version. Bumping transformers.js
 * changes the installed `onnxruntime-web` — it is a transitive, prerelease pin —
 * and nothing else in the build would notice the skew until session creation failed
 * in a browser, on a route most people reach after a 151 MB download.
 *
 * Reads the pnpm store directly rather than resolving the module: `onnxruntime-web`
 * is a transitive dependency and is not hoisted, so `require.resolve` would fail
 * here for reasons unrelated to the thing being asserted.
 */
function installedOrtVersion(): string {
  const dirs = readdirSync('node_modules/.pnpm').filter((d) =>
    d.startsWith('onnxruntime-web@')
  );

  expect(dirs, 'exactly one onnxruntime-web should be installed').toHaveLength(1);

  return dirs[0]!.slice('onnxruntime-web@'.length);
}

describe('ORT CDN pin', () => {
  it('matches the installed onnxruntime-web version', () => {
    expect(ORT_VERSION).toBe(installedOrtVersion());
  });

  it('builds a directory URL, since ORT concatenates the file name onto it', () => {
    expect(ORT_WASM_PATH.endsWith('/')).toBe(true);
    expect(ORT_WASM_PATH).toContain(ORT_VERSION);
  });
});
