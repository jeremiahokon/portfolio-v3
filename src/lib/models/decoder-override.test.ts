import { describe, expect, it } from 'vitest';

import {
  decoderOverride,
  VERIFIED_DECODER_DTYPES,
} from './decoder-override';

describe('decoderOverride', () => {
  it('accepts every dtype verified present at the pinned revision', () => {
    for (const dtype of VERIFIED_DECODER_DTYPES) {
      expect(decoderOverride(`?decoder=${dtype}`)).toBe(dtype);
    }
  });

  it('ignores dtypes that are 404 at this revision', () => {
    // Both exist for other models and would be a natural thing to try.
    expect(decoderOverride('?decoder=q4f16')).toBeNull();
    expect(decoderOverride('?decoder=q8')).toBeNull();
  });

  it('ignores anything unrecognised rather than requesting a missing file', () => {
    expect(decoderOverride('?decoder=INT8')).toBeNull();
    expect(decoderOverride('?decoder=')).toBeNull();
    expect(decoderOverride('?decoder=nonsense')).toBeNull();
    expect(decoderOverride('')).toBeNull();
    expect(decoderOverride('?backend=wasm')).toBeNull();
  });

  it('reads the parameter alongside others', () => {
    expect(decoderOverride('?backend=wasm&decoder=fp16')).toBe('fp16');
  });
});
