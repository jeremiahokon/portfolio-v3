import { describe, expect, it } from 'vitest';

import {
  assess,
  type CapabilityInput,
  isWebKit,
  LONG_JOB_MINUTES,
  MIN_MEMORY_GB,
  REQUIRED_STORAGE_GB,
  WEBKIT_LONG_JOB_MINUTES,
} from './capability';

const desktop: CapabilityInput = {
  memoryGb: 8,
  cores: 10,
  webgpu: true,
  storageQuotaGb: 50,
  coarsePointer: false,
  webkit: false,
};

/** Safari as it actually presents: WebKit, no deviceMemory, no WebGPU adapter. */
const safari: CapabilityInput = {
  ...desktop,
  memoryGb: null,
  webgpu: false,
  webkit: true,
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
      webkit: false,
      durationSeconds: 3600,
    });

    expect(out.verdict).toBe('ready');
  });

  it('warns a long WebKit job about the memory ceiling, by name', () => {
    // The reported failure: Safari reaches the model download and the tab is
    // killed and reloaded. Every other guard here is blind to it — deviceMemory
    // is null so the memory refusal cannot fire, and desktop Safari is not
    // `coarsePointer` so the long-job warning does not either.
    const out = assess({
      ...safari,
      durationSeconds: (WEBKIT_LONG_JOB_MINUTES + 5) * 60,
    });

    expect(out.verdict).toBe('warn');
    expect(out.message).toMatch(/Safari/);
    // Beats the generic "no GPU acceleration" notice, which was all Safari used
    // to get and which says nothing about why the page restarts.
    expect(out.message).not.toMatch(/slower path/);
  });

  it('leaves a short WebKit job on the ordinary slow-path notice', () => {
    const out = assess({ ...safari, durationSeconds: 60 });

    expect(out.verdict).toBe('warn');
    expect(out.message).toMatch(/slower/i);
  });

  it('does not blame WebKit when the device did report its memory', () => {
    // Only an *absent* deviceMemory is a WebKit tell. If a number arrived, the
    // ordinary guards above are trustworthy and own the decision.
    const out = assess({
      ...safari,
      memoryGb: 16,
      durationSeconds: (WEBKIT_LONG_JOB_MINUTES + 5) * 60,
    });

    expect(out.message).not.toMatch(/Safari/);
  });

  it('still refuses a WebKit device with no storage', () => {
    const out = assess({ ...safari, storageQuotaGb: 0, durationSeconds: 3600 });

    expect(out.verdict).toBe('refuse');
    expect(out.message).toMatch(/storage/i);
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
      webkit: false,
    });
  });
});

describe('isWebKit', () => {
  it('detects desktop Safari and iOS', () => {
    expect(
      isWebKit(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15'
      )
    ).toBe(true);
    expect(
      isWebKit(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1'
      )
    ).toBe(true);
  });

  it('is not fooled by the Safari token in Chromium user agents', () => {
    // Both put "Safari" in the UA; treating them as WebKit would hand Chrome a
    // warning about a memory ceiling it does not have.
    expect(
      isWebKit(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36'
      )
    ).toBe(false);
    expect(
      isWebKit(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0'
      )
    ).toBe(false);
  });

  it('treats an empty user agent as not WebKit', () => {
    expect(isWebKit('')).toBe(false);
  });
});
