import type { Backend } from '@/workers/protocol';

/**
 * Reads a deliberate backend choice from the URL: `?backend=wasm` or
 * `?backend=webgpu`.
 *
 * Two reasons this exists rather than being test-only scaffolding:
 *
 * 1. **The WASM path is otherwise unreachable on a machine with a working GPU.**
 *    Verifying that the slow fallback actually completes is a release
 *    requirement, and "disable WebGPU in chrome://flags" is not something that
 *    can be scripted or asked of a user reporting a bug.
 * 2. **WebGPU can be present but broken.** A blocklisted or crashing driver
 *    reports an adapter and then fails mid-inference, and a user in that
 *    position needs a way to get a transcript rather than a support thread.
 *
 * Anything other than the two known values is ignored, so a stray query string
 * can never leave the pipeline with no backend at all.
 */
export function backendOverride(search: string): Backend | null {
  const value = new URLSearchParams(search).get('backend');
  if (value === 'wasm' || value === 'webgpu') return value;

  return null;
}

/** Convenience wrapper for the browser's current URL. */
export function currentBackendOverride(): Backend | null {
  if (typeof globalThis.location === 'undefined') return null;

  return backendOverride(globalThis.location.search);
}
