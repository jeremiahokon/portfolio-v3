import { describe, expect, it } from 'vitest';

import { ASR, STAGE_ONE_BYTES, VAD } from './config';

describe('ASR manifest', () => {
  it('keeps the int8 encoder, as measured', () => {
    // config.ts records that fp16 transcribed a clear 9.7 s clip as `" I."`
    // while int8 was indistinguishable from fp32 and 18 MB smaller. Whatever
    // else changes, the encoder does not go back to fp16.
    expect(ASR.dtype.encoder_model).toBe('int8');
  });

  it('keeps q4 for the decoder on both backends', () => {
    // The int8 decoder is 66 MB smaller and was the obvious Safari fix, but ORT
    // 1.26-dev cannot create a session from it at all — see the table in
    // config.ts. Anything that flips this needs a measurement, not a guess.
    expect(ASR.dtype.decoder_model_merged).toBe('q4');
  });

  it('includes the VAD in the stage-one disclosure', () => {
    expect(STAGE_ONE_BYTES).toBe(ASR.approxBytes + VAD.approxBytes);
  });
});

describe('weight file counts', () => {
  it('records what a complete download leaves cached', () => {
    // Silero is genuinely one file — no config.json, no tokenizer — which is
    // the whole reason the cache manager cannot use a shared constant.
    expect(VAD.weightFiles).toBe(1);
    // Whisper caches an encoder and a merged decoder.
    expect(ASR.weightFiles).toBe(2);
  });
});
