import { describe, expect, it } from 'vitest';

import {
  assess,
  type CapabilityInput,
  LONG_JOB_MINUTES,
  MIN_MEMORY_GB,
  REQUIRED_STORAGE_GB,
} from './capability';

const desktop: CapabilityInput = {
  memoryGb: 8,
  cores: 10,
  webgpu: true,
  storageQuotaGb: 50,
  coarsePointer: false,
};

describe('assess', () => {
  it('clears a capable desktop', () => {
    expect(assess(desktop)).toMatchObject({ verdict: 'ready', message: '' });
  });

  it('refuses when there is no room for the weights', () => {
    const out = assess({ ...desktop, storageQuotaGb: REQUIRED_STORAGE_GB / 2 });

    expect(out.verdict).toBe('refuse');
    expect(out.message).toMatch(/storage/i);
  });

  it('refuses a device reporting too little memory', () => {
    const out = assess({ ...desktop, memoryGb: MIN_MEMORY_GB - 1 });

    expect(out.verdict).toBe('refuse');
    expect(out.message).toMatch(/memory/i);
  });

  it('warns rather than refuses on a long file on a phone', () => {
    const out = assess({
      ...desktop,
      coarsePointer: true,
      durationSeconds: (LONG_JOB_MINUTES + 10) * 60,
    });

    // A warning, not a block: the user may know their device better than we do.
    expect(out.verdict).toBe('warn');
    expect(out.message).toMatch(/desktop/i);
  });

  it('lets a phone run a short file', () => {
    const out = assess({
      ...desktop,
      coarsePointer: true,
      durationSeconds: 60,
    });

    expect(out.verdict).toBe('ready');
  });

  it('warns about the slow path when WebGPU is unavailable', () => {
    const out = assess({ ...desktop, webgpu: false });

    expect(out.verdict).toBe('warn');
    expect(out.message).toMatch(/slower/i);
  });

  it('proceeds when the signals are simply unreported', () => {
    // Firefox and Safari do not expose deviceMemory. Unknown must not mean "no".
    const out = assess({
      memoryGb: null,
      cores: null,
      webgpu: true,
      storageQuotaGb: null,
      coarsePointer: false,
      durationSeconds: 3600,
    });

    expect(out.verdict).toBe('ready');
  });

  it('prefers the storage refusal over the memory one', () => {
    // Both are wrong, and the storage message is the actionable one.
    const out = assess({
      ...desktop,
      storageQuotaGb: 0,
      memoryGb: 1,
    });

    expect(out.message).toMatch(/storage/i);
  });

  it('carries the signals through for diagnostics', () => {
    expect(assess(desktop).signals).toEqual({
      memoryGb: 8,
      cores: 10,
      webgpu: true,
      storageQuotaGb: 50,
      coarsePointer: false,
    });
  });
});
