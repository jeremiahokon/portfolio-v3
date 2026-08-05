/**
 * The only place model host, revision SHAs, model IDs, dtypes and sizes appear.
 *
 * Every value below was verified in M0 against the live Hugging Face API: each
 * URL returned 200 with a `content-length` byte-identical to `approxBytes` (or
 * its per-file breakdown) and advertised `accept-ranges: bytes`.
 *
 * **Revisions are pinned to SHAs, never to `main`.** A retag upstream must not
 * silently change what users download or invalidate caches unpredictably. A
 * resolved `.../resolve/<sha>/<file>` URL cannot change content, which makes the
 * SHA the integrity anchor — that is why there are no separate checksums here.
 *
 * Switching to a self-hosted mirror (e.g. Cloudflare R2) is a one-line change to
 * `MODEL_HOST`, plus bumping `CACHE_KEY` in the same commit so clients re-fetch
 * from the new host instead of serving stale entries. The mirror must preserve
 * the `<org>/<name>/…` layout exactly, because transformers.js resolves by
 * convention and a rename fails as a mid-pipeline 404, not a clear error.
 */

/** One-line switch to a self-hosted mirror. */
export const MODEL_HOST = 'https://huggingface.co';

/**
 * Namespace for cached weights. **Bump on any manifest change** — a dtype
 * swap, a revision bump, an added file — or clients will serve stale weights
 * that no longer match what the code expects.
 */
export const CACHE_KEY = 'jo-subtitles-v1';

export interface ModelSpec {
  id: string;
  revision: string;
  approxBytes: number;
}

/**
 * ASR. Produces the words and punctuation; its segment timestamps are ~1 s
 * granular and are therefore used only to bound alignment windows, never shown
 * to the user once the aligner has run.
 *
 * `dtype` is keyed by **model file name**, not by session key — verified in M0
 * by tracing `constructSessions` → `getSession(path, names[name], …)` →
 * `selectDtype(dtype, fileName, …)`. Whisper is a Seq2Seq model whose session
 * map is `{ model: 'encoder_model', decoder_model_merged: 'decoder_model_merged' }`,
 * so the encoder's *session* key is `model` but its *file* name is
 * `encoder_model`, and the keys below are the file names.
 *
 * A key that matches no file does **not** throw — transformers.js silently falls
 * back to the device default dtype, which would quietly download the wrong
 * (larger) weights. The loader asserts the resolved dtype for that reason.
 *
 * **The encoder dtype was chosen by measurement, and it overturns the plan's
 * decision D4.** D4 picked fp16 (41.3 MB) over fp32 (82.5 MB) on the reasoning
 * that WebGPU is the primary path and fp16 is native there, with a note to
 * revisit if transcript quality suffered. It suffers completely: on Chrome 150 /
 * macOS / WebGPU, the fp16 encoder transcribed a clear 9.7 s utterance as the
 * single word `" I."`. Verified it is the encoder and not the audio — the
 * samples reaching the model measured 154,553 samples, RMS 0.1460, peak 0.8183,
 * byte-identical to an ffmpeg CLI decode of the same clip.
 *
 * Same clip, same everything, encoder dtype the only variable:
 *
 * | encoder dtype | size    | result                                  |
 * |---------------|---------|-----------------------------------------|
 * | fp16          | 41.3 MB | `" I."` — unusable                      |
 * | fp32          | 82.5 MB | near-verbatim transcript                |
 * | **int8**      | 23.2 MB | near-verbatim, indistinguishable from fp32 |
 *
 * So int8 is both correct *and* the smallest of the three — 18 MB less than the
 * fp16 the plan assumed, which improves the download budget rather than costing
 * it. Caveat worth keeping in view: this is one clip on one browser and GPU. It
 * is strictly better evidence than fp16 ever had, but the honest evaluation is
 * the scorer that the aligner milestone builds; re-run this comparison there,
 * and re-check on Safari, where the fp16 path may fail differently.
 *
 * The merged decoder reuses the KV cache; the unmerged pair would cost
 * 123.4 MB + 121.3 MB instead of one 123.6 MB file.
 */
export const ASR = {
  id: 'onnx-community/whisper-base',
  revision: '1846881b6b3a3024392c1eea3ad983695bc23925',
  dtype: { encoder_model: 'int8', decoder_model_merged: 'q4' },
  // int8 encoder 23.2 MB + q4 merged decoder 123.6 MB + tokenizer/configs ~4.3 MB.
  approxBytes: 151_000_000,
} as const;

/**
 * Forced aligner. Every timestamp the user sees comes from this model's CTC
 * frame logits via a trellis + Viterbi backtrack, not from Whisper.
 *
 * **This is an opt-in second download**, deliberately not bundled with the ASR
 * stage: ~355–400 MB before the first word is incompatible with a free-tool
 * funnel, so stage one ships Whisper alone and produces a usable transcript
 * with estimated timings.
 *
 * `dtype` is provisional. Quantization degrades CTC frame logits and the frame
 * logits *are* the timing, but by how much is an empirical question — the
 * scorer decides it by measuring word-boundary precision and recall at a 200 ms
 * collar across fp16 / q4f16 / int8, and the smallest tier that clears
 * 0.90/0.90 ships. fp16 (189.1 MB) is the safe default until that runs;
 * q4f16 is 66.4 MB and int8 is 95.2 MB, both verified to exist at this revision.
 */
export const ALIGNER = {
  id: 'onnx-community/wav2vec2-base-960h-ONNX',
  revision: '729c1a6730fb549c20a1c73a3d3f96f11020225e',
  dtype: 'fp16',
  approxBytes: 189_000_000,
} as const;

/**
 * Voice activity detection, used to place chunk boundaries inside silence so no
 * word is ever split across two analysis windows.
 *
 * Loaded through the ONNX Runtime that transformers.js already brings, rather
 * than via a dedicated VAD package: `@ricky0123/vad-web` pins ORT `^1.17.0`
 * against transformers.js 4.2.0's `1.26.0-dev.20260416-b7804b056c`, and two ORT
 * copies plus two sets of WASM artifacts in one page is a real cost and a real
 * bug surface. M0 confirmed exactly one `onnxruntime-web` in the lockfile.
 */
export const VAD = {
  id: 'onnx-community/silero-vad',
  revision: 'e71cae966052b992a7eca6b17738916ce0eca4ec',
  file: 'onnx/model.onnx',
  approxBytes: 2_243_022,
} as const;

/** Total bytes for the first-stage download, disclosed before it starts. */
export const STAGE_ONE_BYTES = ASR.approxBytes + VAD.approxBytes;
