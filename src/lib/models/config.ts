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
 * ONNX Runtime's own WASM binaries, served from a CDN rather than from us.
 *
 * **This was believed to be true and was not.** `configureEnv` carried a comment
 * saying the ORT binaries were "left on the CDN", but without `wasmPaths` set,
 * Turbopack resolved them as bundler assets and emitted
 * `ort-wasm-simd-threaded.asyncify.wasm` — **23.6 MB** — into `.next/static/media`.
 * Every first-time user was pulling it from Vercel, which is exactly what the
 * plan's "weights are never served from Vercel" rule exists to prevent. The rule
 * was honoured for the model weights and quietly broken for the runtime.
 *
 * Verified rather than assumed: this version is a **prerelease** pulled in by
 * transformers.js, so its presence on a CDN is not a given. The pinned files
 * return 200 with `content-type: application/wasm`,
 * `access-control-allow-origin: *` and `cache-control: max-age=31536000, immutable`.
 *
 * **The version must match the installed `onnxruntime-web` exactly.** `wasmPaths`
 * supplies both the `.wasm` and its `.mjs` factory, so those two are consistent
 * with each other by construction — but the main ORT JavaScript is bundled from
 * `node_modules`, and a skew between that and the CDN glue would break session
 * creation. `ort-version.test.ts` fails if the two drift, so bumping
 * transformers.js cannot silently break this.
 */
export const ORT_VERSION = '1.26.0-dev.20260416-b7804b056c';

/** Trailing slash is required — ORT concatenates the file name onto it. */
export const ORT_WASM_PATH = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;

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
  /**
   * How many `.onnx` weight files a complete download leaves in the cache.
   *
   * The cache manager needs a per-model answer, and this is the only honest
   * one. It previously assumed every model caches "weights plus a tokenizer and
   * configs" and tested for three or more files of any kind — which is true of
   * Whisper and wav2vec2 and **false of Silero**, a single-file model with no
   * `config.json` and no tokenizer at all (see `vad.worker.ts`). The VAD
   * therefore reported "incomplete" on a perfectly healthy cache, forever.
   *
   * Counting `.onnx` entries rather than all entries is also the more robust
   * test: Cache API writes are atomic, so a weight file is either wholly present
   * or absent, and which *JSON* sidecars transformers.js chooses to fetch is an
   * internal detail that has changed between versions.
   */
  weightFiles: number;
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
 *
 * **The int8 decoder is not available on the WASM backend, and that was tried.**
 * The obvious lever for Safari's memory ceiling is the decoder: `q4` is
 * 123.6 MB, the largest of the quantized variants, while
 * `decoder_model_merged_int8` is 53.7 MB. Switching it on the WASM path would
 * have taken stage one from ~151 MB to ~81 MB.
 *
 * It does not load. The weights download fine and then ORT 1.26-dev fails to
 * create the session outright, on Chromium's WASM backend, before Safari is even
 * in the picture:
 *
 * ```
 * Can't create a session. ERROR_CODE: 1,
 * qdq_actions.cc:137 TransposeDQWeightsForMatMulNBits Missing required scale:
 * model.decoder.embed_tokens.weight_merged_0_scale
 * ```
 *
 * Measured on the same fixture and the same backend, for the next person who
 * reaches for this:
 *
 * | decoder dtype | size     | WASM result                          |
 * |---------------|----------|--------------------------------------|
 * | `int8`        |  51.2 MB | **session creation fails** (above)   |
 * | `fp16`        |  99.9 MB | works — 9 cues, 53 words             |
 * | **`q4`**      | 117.9 MB | works — 9 cues, 54 words             |
 *
 * `quantized` and `uint8` are byte-identical to `int8` and would hit the same
 * graph. `fp16` does work and would save ~18 MB, but that is a different and
 * unmeasured quality trade on a path with no fp16 CPU kernels — the scorer the
 * aligner milestone builds is what should decide it, exactly as D15 decided the
 * encoder. Until then `q4` stays on both backends because it is the one that was
 * actually measured.
 *
 * So Safari's headroom is bought elsewhere: the ffmpeg core is now freed before
 * the download starts (32 MB), and `capability.ts` warns before spending the
 * bandwidth rather than after.
 */
export const ASR = {
  id: 'onnx-community/whisper-base',
  revision: '1846881b6b3a3024392c1eea3ad983695bc23925',
  dtype: { encoder_model: 'int8', decoder_model_merged: 'q4' },
  // int8 encoder 23.2 MB + q4 merged decoder 123.6 MB + tokenizer/configs ~4.3 MB.
  approxBytes: 151_000_000,
  /** Encoder + merged decoder. */
  weightFiles: 2,
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
  weightFiles: 1,
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
  // The whole repo: no config.json, no tokenizer, nothing but this one file.
  weightFiles: 1,
} as const;

/** Total bytes for the first-stage download, disclosed before it starts. */
export const STAGE_ONE_BYTES = ASR.approxBytes + VAD.approxBytes;
