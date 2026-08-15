/**
 * Reads a deliberate Whisper **decoder** dtype from the URL: `?decoder=int8`.
 *
 * This exists to settle D17. D15 measured the *encoder* across three dtypes in
 * detail and found the result was not predictable from reasoning — fp16 collapsed
 * a clear utterance to the single word `" I."` while int8, the smallest of the
 * three, was indistinguishable from fp32. The **decoder** was never measured. It
 * was left at `q4` (`config.ts:82`), and it is the component that actually
 * produces the words, so it is the prime suspect for the word errors reported on
 * the 39-minute Zoom call.
 *
 * The sizes make the question worth asking rather than assuming. Verified by HTTP
 * HEAD against the pinned revision, so these are real files and real bytes:
 *
 * | dtype        | size     |
 * |--------------|----------|
 * | (none, fp32) | 198.9 MB |
 * | `q4`         | 117.9 MB | ← current
 * | `bnb4`       | 116.4 MB |
 * | `fp16`       |  99.9 MB |
 * | `int8`       |  51.2 MB |
 *
 * `int8` is **66.7 MB smaller than the q4 currently shipping**, so if it holds up
 * it improves R1's download-weight risk at the same time as word accuracy. That is
 * exactly the shape D15 turned out to have, which is the reason not to guess.
 *
 * `q4f16` and `q8` are **404 at this revision** and deliberately absent from the
 * list below; `quantized` and `uint8` are byte-identical in size to `int8` and are
 * omitted as aliases rather than offered as distinct choices to measure.
 *
 * Anything unrecognised is ignored, so a typo falls back to the shipped default
 * instead of requesting a file that does not exist.
 *
 * **`int8` is downloadable but not loadable on the WASM backend.** Measured, not
 * assumed: the weights fetch and then ORT 1.26-dev refuses to build the session
 * with `TransposeDQWeightsForMatMulNBits Missing required scale`. It is left in
 * the list because reproducing that failure in one URL is the point of this
 * file, but it cannot be the shipped default — see the table in `config.ts`.
 */

/** Decoder dtypes confirmed present at `ASR.revision` by HTTP HEAD. */
export const VERIFIED_DECODER_DTYPES = [
  'fp32',
  'fp16',
  'q4',
  'bnb4',
  'int8',
] as const;

export type DecoderDtype = (typeof VERIFIED_DECODER_DTYPES)[number];

export function decoderOverride(search: string): DecoderDtype | null {
  const value = new URLSearchParams(search).get('decoder');

  return VERIFIED_DECODER_DTYPES.includes(value as DecoderDtype)
    ? (value as DecoderDtype)
    : null;
}

/** Convenience wrapper for the browser's current URL. */
export function currentDecoderOverride(): DecoderDtype | null {
  if (typeof globalThis.location === 'undefined') return null;

  return decoderOverride(globalThis.location.search);
}
