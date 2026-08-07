import { describe, expect, it } from 'vitest';

import { backendOverride } from './backend-override';

describe('backendOverride', () => {
  it('reads an explicit wasm choice', () => {
    expect(backendOverride('?backend=wasm')).toBe('wasm');
  });

  it('reads an explicit webgpu choice', () => {
    expect(backendOverride('?backend=webgpu')).toBe('webgpu');
  });

  it('returns null when absent, so detection decides', () => {
    expect(backendOverride('')).toBeNull();
    expect(backendOverride('?foo=bar')).toBeNull();
  });

  it('ignores an unknown value rather than passing it through', () => {
    // A typo must not reach transformers.js as a device name, and must not
    // leave the pipeline with no backend at all.
    expect(backendOverride('?backend=cuda')).toBeNull();
    expect(backendOverride('?backend=')).toBeNull();
    expect(backendOverride('?backend=WASM')).toBeNull();
  });

  it('finds the parameter among others', () => {
    expect(backendOverride('?a=1&backend=wasm&b=2')).toBe('wasm');
  });
});
