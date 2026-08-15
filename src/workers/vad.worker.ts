/// <reference lib="webworker" />

import {
  AutoModel,
  type PreTrainedModel,
  Tensor,
} from '@huggingface/transformers';

import { configureEnv, toDownloadProgress } from '@/lib/models/loader';
import type { ErrorCode } from '@/lib/subtitles/types';
import { regionsFromProbabilities } from '@/lib/subtitles/vad-regions';

import { type FromWorker, isToWorker, type ToWorker } from './protocol';

/**
 * Silero voice activity detection.
 *
 * Used only to place chunk boundaries inside silence — it is never shown to the
 * user — but getting it right is what stops Whisper being handed half a word and
 * inventing a whole one from it.
 *
 * **Loading a model transformers.js has no class for.** `onnx-community/silero-vad`
 * ships no `config.json` and there is no Silero architecture in the library, so
 * this supplies `model_type: 'custom'`, which the library tolerates (it skips its
 * "unknown architecture" warning for exactly that value) and falls back to a
 * plain encoder. That gives an ONNX session fetched, revision-pinned and cached
 * through the same machinery as every other model — which is the point, since
 * pulling in `onnxruntime-web` directly would mean a second ORT copy in the page.
 *
 * The model is a stateful RNN, so `state` is threaded from each call into the
 * next rather than being a fresh zero tensor per frame.
 *
 * **The 404 in the network tab is this, and it is harmless.** Loading the VAD
 * emits one failing request:
 *
 * ```
 * huggingface.co/onnx-community/silero-vad/resolve/<sha>/config.json  404
 * ```
 *
 * It is *not* the config load — that is short-circuited by the object passed
 * below, and was traced through `PretrainedConfig.from_pretrained`
 * (`const data = config ?? await loadConfig(...)`) to confirm it. It comes from
 * `get_model_files`, which transformers.js 4.2.0 runs **only when a
 * `progress_callback` is supplied**, to size the download bar. That function
 * opens with a hardcoded `const files = ["config.json"]` — commented "always
 * loaded" — and then probes each entry for metadata. For a repository that has
 * no `config.json`, the probe 404s and is discarded.
 *
 * Deliberately not worked around. The only lever is dropping the
 * `progress_callback`, which would silence one ignored request at the cost of
 * leaving 2.2 MB out of the download total the UI promises — a progress bar
 * that lies is worse than a console entry that changes nothing. The cost of
 * this 404 is that it looks alarming, so the fix is to say what it is here.
 */

/** Silero v5 consumes exactly 512 samples per frame at 16 kHz. Not tunable. */
const FRAME_SAMPLES = 512;
/** Shape of the recurrent state: [2, batch, 128]. */
const STATE_SHAPE = [2, 1, 128];

let model: PreTrainedModel | null = null;
let currentJob: string | null = null;
let cancelled = false;

function post(message: FromWorker): void {
  self.postMessage(message);
}

function fail(jobId: string, code: ErrorCode, err: unknown): void {
  post({
    t: 'error',
    jobId,
    stage: 'vad',
    code,
    message: err instanceof Error ? err.message : String(err),
  });
}

async function init(message: Extract<ToWorker, { t: 'init' }>): Promise<void> {
  currentJob = message.jobId;
  cancelled = false;

  configureEnv({ host: message.host, cacheKey: message.cacheKey });

  try {
    model = await AutoModel.from_pretrained(message.model.id, {
      revision: message.model.revision,
      // See the note above: there is no Silero class, and 'custom' is the value
      // the library treats as "deliberately unrecognised" rather than a bug.
      config: { model_type: 'custom' } as never,
      model_file_name: 'model',
      // 2 MB model, one tiny forward pass per 32 ms of audio. WASM avoids the
      // per-dispatch GPU overhead that would dominate at that size, and keeps
      // the GPU free for Whisper.
      device: 'wasm',
      dtype: 'fp32',
      progress_callback: (info) => {
        if (cancelled) return;
        const progress = toDownloadProgress(info);
        if (progress) {
          post({
            t: 'download',
            jobId: message.jobId,
            file: progress.file,
            loaded: progress.loaded,
            total: progress.total,
          });
        }
      },
    });
  } catch (err) {
    fail(message.jobId, 'model-download-failed', err);

    return;
  }

  post({ t: 'ready', jobId: message.jobId, backend: 'wasm' });
}

async function detect(message: Extract<ToWorker, { t: 'vad' }>): Promise<void> {
  if (!model) {
    fail(message.jobId, 'unknown', new Error('VAD model not initialised'));

    return;
  }

  const samples = new Float32Array(message.pcm);
  const sampleRate = message.sampleRate;
  const frameCount = Math.floor(samples.length / FRAME_SAMPLES);
  const probabilities = new Float32Array(frameCount);

  // Reused across frames; only its data is rewritten.
  let state = new Tensor(
    'float32',
    new Float32Array(STATE_SHAPE[0]! * STATE_SHAPE[1]! * STATE_SHAPE[2]!),
    STATE_SHAPE
  );
  const sr = new Tensor('int64', new BigInt64Array([BigInt(sampleRate)]), []);

  try {
    for (let i = 0; i < frameCount; i += 1) {
      if (cancelled || message.jobId !== currentJob) return;

      const frame = samples.subarray(
        i * FRAME_SAMPLES,
        (i + 1) * FRAME_SAMPLES
      );
      const input = new Tensor('float32', frame, [1, FRAME_SAMPLES]);

      const output = await model({ input, state, sr });

      probabilities[i] = Number(output.output.data[0] ?? 0);
      // Thread the recurrent state forward. Dropping it would make every frame
      // an independent decision and destroy the model's temporal smoothing.
      state = output.stateN;

      // Report progress occasionally rather than per frame: a 30-minute file is
      // ~56,000 frames, and a postMessage each would cost more than the model.
      if (i % 500 === 0) {
        post({
          t: 'progress',
          jobId: message.jobId,
          stage: 'vad',
          ratio: i / frameCount,
        });
      }
    }
  } catch (err) {
    if (cancelled) return;
    fail(message.jobId, 'unknown', err);

    return;
  }

  const regions = regionsFromProbabilities(
    probabilities,
    FRAME_SAMPLES / sampleRate,
    samples.length / sampleRate
  );

  post({ t: 'vad:done', jobId: message.jobId, regions });
}

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  const message = event.data;
  if (!isToWorker(message)) return;

  if (message.t === 'cancel') {
    if (message.jobId === currentJob) cancelled = true;

    return;
  }
  if (
    currentJob !== null &&
    message.jobId !== currentJob &&
    message.t !== 'init'
  ) {
    return;
  }

  switch (message.t) {
    case 'init':
      void init(message);
      break;
    case 'vad':
      void detect(message);
      break;
    default:
      break;
  }
});
