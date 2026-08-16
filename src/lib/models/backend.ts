import type { Backend } from '@/workers/protocol';

/**
 * Backend selection, split out of `loader.ts` so the main thread can use it.
 *
 * `loader.ts` mutates the transformers.js global `env` singleton and is therefore
 * worker-only. These three functions touch nothing but `navigator`, and the main
 * thread now needs the answer *before* it starts a job: the chosen backend
 * decides which Whisper decoder weights are downloaded and therefore how many
 * megabytes the UI must disclose up front. Resolving it here once and passing it
 * to the worker also replaces a second `requestAdapter()` probe.
 */

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
  const gpu = (
    globalThis.navigator as Navigator & {
      gpu?: { requestAdapter(): Promise<unknown> };
    }
  )?.gpu;
  if (!gpu) return false;
  try {
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
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
