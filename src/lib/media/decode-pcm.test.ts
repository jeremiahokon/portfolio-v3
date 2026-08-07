import { describe, expect, it } from 'vitest';

import {
  int16ToFloat32,
  isEffectivelySilent,
  rms,
  SILENCE_RMS,
} from './decode-pcm';

/** Builds little-endian s16 bytes from sample values. */
function pcm(values: number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 2);
  const view = new DataView(bytes.buffer);
  values.forEach((v, i) => view.setInt16(i * 2, v, true));

  return bytes;
}

describe('int16ToFloat32', () => {
  it('maps the negative extreme to exactly -1', () => {
    expect(int16ToFloat32(pcm([-32_768]))[0]).toBe(-1);
  });

  it('never exceeds 1 at the positive extreme', () => {
    // Dividing by 32767 instead would make -32768 land beyond -1; dividing by
    // 32768 keeps both ends inside the range at the cost of a hair of headroom.
    const value = int16ToFloat32(pcm([32_767]))[0]!;
    expect(value).toBeLessThan(1);
    expect(value).toBeGreaterThan(0.999);
  });

  it('maps silence to zero', () => {
    expect([...int16ToFloat32(pcm([0, 0, 0]))]).toEqual([0, 0, 0]);
  });

  it('ignores a trailing odd byte rather than reading a bogus sample', () => {
    const bytes = new Uint8Array([0x00, 0x40, 0x7f]);

    expect(int16ToFloat32(bytes)).toHaveLength(1);
  });

  it('returns nothing for an empty buffer', () => {
    expect(int16ToFloat32(new Uint8Array())).toHaveLength(0);
  });
});

describe('rms', () => {
  it('is zero for silence', () => {
    expect(rms(new Float32Array(1000))).toBe(0);
  });

  it('is the amplitude for a constant signal', () => {
    expect(rms(new Float32Array(100).fill(0.5))).toBeCloseTo(0.5, 6);
  });

  it('handles an empty buffer without dividing by zero', () => {
    expect(rms(new Float32Array())).toBe(0);
  });
});

describe('isEffectivelySilent', () => {
  it('treats digital silence as silent', () => {
    expect(isEffectivelySilent(new Float32Array(16_000))).toBe(true);
  });

  it('treats a muted-microphone floor as silent', () => {
    // The real screen recording measured about -91 dBFS.
    expect(isEffectivelySilent(new Float32Array(16_000).fill(0.00003))).toBe(
      true
    );
  });

  it('does not treat real speech as silent', () => {
    // Measured RMS of the actual speech fixture was ~0.15.
    expect(isEffectivelySilent(new Float32Array(16_000).fill(0.15))).toBe(
      false
    );
  });

  it('does not treat quiet-but-audible speech as silent', () => {
    // An order of magnitude above the threshold is still clearly not silence,
    // which is the margin that keeps this from misfiring on a soft recording.
    expect(
      isEffectivelySilent(new Float32Array(16_000).fill(SILENCE_RMS * 10))
    ).toBe(false);
  });
});
