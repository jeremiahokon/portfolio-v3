import { env } from '@huggingface/transformers';

import type { Backend } from '@/workers/protocol';

import { ORT_WASM_PATH } from './config';

/**
 * transformers.js environment wiring, shared by every pipeline worker.
 *
 * This module is imported *inside workers only*. It touches the global
 * `env` singleton, so importing it on the main thread would configure a
 * different ORT instance than the one actually running inference.
 *
 * **On capability detection.** transformers.js does maintain an internal `apis`
 * object with exactly the flags we want (`IS_WEBGPU_AVAILABLE`, `IS_SAFARI`,
 * `IS_WEB_CACHE_AVAILABLE`), and its docs point at them — but it is **not part
 * of the public API** in 4.2.0. The package's `exports` map declares no
 * subpaths, so a deep import is blocked, and the built `transformers.web.js`
 * exports only `env` and `LogLevel`. Verified both ways before writing the
 * checks below by hand. If a later version re-exports `apis`, prefer it.
 */

/** Per-file download progress, forwarded to the UI so 169 MB is never a surprise. */
export interface DownloadProgress {
  file: string;
  loaded: number;
  total: number | null;
}

/** The Cache API is absent in some private-browsing modes, not just old browsers. */
function isCacheAvailable(): boolean {
  return typeof caches !== 'undefined';
}

/**
 * Whether WebGPU is genuinely usable, not merely present.
 *
 * `'gpu' in navigator` is not sufficient: the property exists in contexts where
 * `requestAdapter()` then resolves to `null` (no compatible adapter, blocklisted
 * driver, or a software fallback the browser declines to expose). Since the
 * fallback path is ~10x slower and the UI promises a duration up front, this
 * asks for a real adapter rather than trusting feature detection.
 */
export async function isWebGpuAvailable(): Promise<boolean> {
  const gpu = (navigator as { gpu?: { requestAdapter(): Promise<unknown> } })
    .gpu;
  if (!gpu) return false;
  try {
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}

let configured = false;

/**
 * Configures `env` once per worker.
 *
 * Idempotent because each worker calls it on `init`, and a job may re-init
 * after a cancel.
 */
export function configureEnv({
  host,
  cacheKey,
}: {
  host: string;
  cacheKey: string;
}): void {
  if (configured) return;
  configured = true;

  // In-browser there is no filesystem to load from, and leaving local lookups
  // on costs a wasted 404 round-trip per file before the remote fetch.
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  env.remoteHost = host;

  // Namespaced so a manifest change (dtype swap, revision bump) never serves
  // weights that no longer match what the code expects. The revision SHA is
  // already in the request path, so entries are keyed per revision within this
  // namespace.
  env.cacheKey = cacheKey;
  env.useBrowserCache = isCacheAvailable();

  // Point ORT at the CDN explicitly. Without this the bundler resolves the
  // binaries as build assets and ships 23.6 MB of them from our own origin — see
  // ORT_WASM_PATH for the measurement and the version-pinning constraint.
  //
  // Assigned defensively: `backends.onnx.wasm` is optional in the installed
  // types, so a runtime that has not populated it must not throw here.
  const wasm = env.backends?.onnx?.wasm;
  if (wasm) {
    (wasm as { wasmPaths?: string }).wasmPaths = ORT_WASM_PATH;
  }

  // Pre-loads and caches the ORT WASM binary and its .mjs factory, so the CDN is
  // hit once per revision rather than once per session.
  env.useWasmCache = isCacheAvailable();

  installQuotaTolerantCache();
}

/**
 * Wraps the Cache API so a full disk degrades to streaming rather than failing.
 *
 * A `QuotaExceededError` on write is not a reason to fail a transcription — the
 * weights are already in memory by then. Swallowing the write means this
 * session works and the next one re-downloads, which is a far better outcome
 * than an error page. `match` failures are swallowed for the same reason: an
 * unreadable cache should look like a cache miss.
 */
function installQuotaTolerantCache(): void {
  if (!isCacheAvailable()) return;

  let quotaExhausted = false;

  env.useCustomCache = true;
  env.customCache = {
    async match(request: string) {
      try {
        const cache = await caches.open(env.cacheKey);

        return await cache.match(request);
      } catch {
        return undefined;
      }
    },
    async put(request: string, response: Response) {
      // Once quota is gone it stays gone for this session; stop paying the
      // failed-write cost on every subsequent file.
      if (quotaExhausted) return;
      try {
        const cache = await caches.open(env.cacheKey);
        await cache.put(request, response);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'QuotaExceededError') {
          quotaExhausted = true;
          console.warn(
            '[models] storage quota exhausted — weights will re-download next session'
          );

          return;
        }
        console.warn(
          '[models] cache write failed, continuing without cache',
          err
        );
      }
    },
    async delete(request: string) {
      try {
        const cache = await caches.open(env.cacheKey);

        return await cache.delete(request);
      } catch {
        return false;
      }
    },
  };
}

/**
 * Picks an execution backend.
 *
 * WebGPU needs no SharedArrayBuffer and therefore no cross-origin isolation,
 * which is why it is the primary path on a site that deliberately ships without
 * COOP/COEP. The WASM fallback will run **single-threaded** here for exactly
 * that reason — ORT enables WASM threads only when `crossOriginIsolated` is
 * true — so it is materially slower, and the UI must say so before starting
 * rather than letting the user discover a 10x slowdown.
 */
export async function selectBackend(): Promise<Backend> {
  return (await isWebGpuAvailable()) ? 'webgpu' : 'wasm';
}

/**
 * True when inference will run on single-threaded WASM, i.e. slowly.
 *
 * `crossOriginIsolated` is `false` on every route of this site by design — the
 * audio extractor's single-threaded FFmpeg core needs no isolation, and adding
 * `require-corp` back would re-introduce the Vercel module-worker block that
 * hung it in production. So this is `true` whenever WebGPU is unavailable.
 */
export function isSingleThreadedWasm(backend: Backend): boolean {
  return backend === 'wasm' && !globalThis.crossOriginIsolated;
}

/**
 * Normalises transformers.js progress events into per-file byte counts.
 *
 * The library emits several statuses; only `progress` carries per-file bytes.
 * `progress_total` is an aggregate the library computes itself, which we ignore
 * here so the store can aggregate against the manifest's known sizes instead —
 * that lets the UI show a real total before a single byte has been fetched.
 */
export function toDownloadProgress(info: {
  status: string;
  file?: string;
  loaded?: number;
  total?: number;
}): DownloadProgress | null {
  if (info.status !== 'progress' || !info.file) return null;

  return {
    file: info.file,
    loaded: info.loaded ?? 0,
    total: typeof info.total === 'number' && info.total > 0 ? info.total : null,
  };
}

/**
 * Asserts that a requested per-file dtype map matches the files actually loaded.
 *
 * transformers.js resolves `dtype` by **file name**, and an unrecognised key
 * does not throw — it silently falls back to the device default, which would
 * quietly fetch different (usually much larger) weights than the manifest
 * promised. Since the whole download-size story depends on getting fp16/q4
 * exactly, a mismatch is worth a loud warning.
 */
export function assertDtypeApplied(
  dtype: string | Record<string, string>,
  loadedFiles: string[]
): void {
  if (typeof dtype === 'string') return;

  for (const [fileName, requested] of Object.entries(dtype)) {
    const suffix = DTYPE_SUFFIX[requested];
    if (suffix === undefined) {
      console.warn(`[models] unknown dtype "${requested}" for ${fileName}`);
      continue;
    }
    const expected = `${fileName}${suffix}.onnx`;
    if (!loadedFiles.some((file) => file.endsWith(expected))) {
      console.warn(
        `[models] dtype "${requested}" for "${fileName}" did not resolve to ${expected} — ` +
          `transformers.js may have fallen back to the device default. Loaded: ${loadedFiles.join(', ')}`
      );
    }
  }
}

/** Mirrors transformers.js's own dtype→filename-suffix mapping. */
const DTYPE_SUFFIX: Record<string, string> = {
  fp32: '',
  fp16: '_fp16',
  int8: '_int8',
  uint8: '_uint8',
  q8: '_quantized',
  q4: '_q4',
  q4f16: '_q4f16',
};
