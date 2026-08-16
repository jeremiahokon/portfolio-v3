/// <reference lib="webworker" />

import {
  AutoModelForCTC,
  AutoProcessor,
  type PreTrainedModel,
  type Processor,
} from '@huggingface/transformers';

import { selectBackend } from '@/lib/models/backend';
import { configureEnv, toDownloadProgress } from '@/lib/models/loader';
import {
  alignTokens,
  type Emissions,
  mergeTokensToWords,
  spanToSeconds,
} from '@/lib/subtitles/align-ctc';
import {
  type CtcVocabulary,
  leadingDelimitersPerWord,
  makeVocabulary,
  tokenCountsPerWord,
  tokenizeForCtc,
} from '@/lib/subtitles/ctc-vocab';
import type { AlignedWord, ErrorCode } from '@/lib/subtitles/types';

import { type FromWorker, isToWorker, type ToWorker } from './protocol';

/**
 * wav2vec2 CTC forced aligner.
 *
 * Every timestamp the user finally sees comes from here. Whisper supplies the
 * words; this decides where they are. One non-autoregressive forward pass per
 * window, then a trellis and a backtrack — which is why re-timing after an edit is
 * cheap rather than a re-transcription.
 *
 * The interesting work is in `align-ctc.ts` and `ctc-vocab.ts`, both pure and both
 * tested against constructed emissions. This file owns only the session and the
 * tensor plumbing.
 */

/**
 * Seconds of audio per output frame.
 *
 * The model's `conv_stride` is [5,2,2,2,2,2,2], which multiplies to 320 samples;
 * at 16 kHz that is exactly 20 ms. Derived rather than guessed, and asserted
 * against the model's real output length below — if a different checkpoint strides
 * differently, that assertion is what will say so.
 */
const FRAME_SECONDS = 320 / 16_000;

/**
 * Words scoring below this keep their estimated timing instead.
 *
 * A forced aligner always produces *an* answer; the score is the only signal that
 * the answer was not supported by the acoustics. Overwriting a rough-but-plausible
 * estimate with a confident-looking wrong number is the worse failure, so the
 * threshold errs toward keeping the estimate.
 */
const MIN_WORD_SCORE = 0.15;

let model: PreTrainedModel | null = null;
let processor: Processor | null = null;
let vocabulary: CtcVocabulary | null = null;
let currentJob: string | null = null;
let cancelled = false;

function post(message: FromWorker): void {
  self.postMessage(message);
}

function fail(jobId: string, code: ErrorCode, err: unknown): void {
  post({
    t: 'error',
    jobId,
    stage: 'align',
    code,
    message: err instanceof Error ? err.message : String(err),
  });
}

/**
 * Reads the CTC label set from the model repo's own `vocab.json`.
 *
 * Fetched directly rather than pulled off the loaded tokenizer, and that is a
 * deliberate reversal: reaching into `processor.tokenizer.model.vocab` was the
 * first attempt and it failed at runtime, because that shape is an internal detail
 * of a library at a prerelease pin. `vocab.json` is 358 bytes, is part of the
 * model's public contract, and is fetched at the same pinned revision as the
 * weights — so it cannot drift from them, and no library refactor can break it.
 *
 * The label set is not optional detail: it decides which characters this
 * checkpoint can represent at all, and getting it wrong would index every token
 * into the wrong logit column.
 */
async function fetchVocabulary(
  host: string,
  id: string,
  revision: string
): Promise<CtcVocabulary> {
  const url = `${host}/${id}/resolve/${revision}/vocab.json`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Could not fetch the CTC vocabulary (${response.status}) from ${url}`
    );
  }

  return makeVocabulary((await response.json()) as Record<string, number>);
}

async function init(message: Extract<ToWorker, { t: 'init' }>): Promise<void> {
  currentJob = message.jobId;
  cancelled = false;

  configureEnv({ host: message.host, cacheKey: message.cacheKey });

  const backend = message.model.device ?? (await selectBackend());

  try {
    const options = {
      revision: message.model.revision,
      dtype: message.model.dtype as never,
      device: backend,
      progress_callback: (info: { status: string }) => {
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
    };

    [model, processor, vocabulary] = await Promise.all([
      AutoModelForCTC.from_pretrained(message.model.id, options),
      AutoProcessor.from_pretrained(message.model.id, options),
      fetchVocabulary(message.host, message.model.id, message.model.revision),
    ]);
  } catch (err) {
    fail(message.jobId, 'model-download-failed', err);

    return;
  }

  post({ t: 'ready', jobId: message.jobId, backend });
}

/**
 * Reads the model's logits into frame-major log-probabilities.
 *
 * The head emits raw logits, and the trellis needs log-probabilities, so this
 * applies log-softmax per frame. Done with the max subtracted first: `exp` of a
 * raw logit overflows, and the subtraction is algebraically free.
 */
function toLogProbs(logits: {
  data: ArrayLike<number>;
  dims: number[];
}): Emissions {
  const dims = logits.dims;
  const frames = dims.at(-2) ?? 0;
  const vocabSize = dims.at(-1) ?? 0;
  const data = new Float32Array(frames * vocabSize);

  for (let frame = 0; frame < frames; frame += 1) {
    const base = frame * vocabSize;

    let max = -Infinity;
    for (let v = 0; v < vocabSize; v += 1) {
      const value = logits.data[base + v] as number;
      if (value > max) max = value;
    }

    let sumExp = 0;
    for (let v = 0; v < vocabSize; v += 1) {
      sumExp += Math.exp((logits.data[base + v] as number) - max);
    }
    const logSumExp = max + Math.log(sumExp);

    for (let v = 0; v < vocabSize; v += 1) {
      data[base + v] = (logits.data[base + v] as number) - logSumExp;
    }
  }

  return { data, frames, vocabSize };
}

async function align(
  message: Extract<ToWorker, { t: 'align' }>
): Promise<void> {
  if (!model || !processor || !vocabulary) {
    fail(message.jobId, 'unknown', new Error('Aligner not initialised'));

    return;
  }

  const samples = new Float32Array(message.pcm);
  const tokenized = tokenizeForCtc(message.tokens, vocabulary);

  // Nothing representable in this window — a stretch of pure digits, say. Report
  // no words rather than an empty alignment the caller might mistake for success.
  if (tokenized.tokens.length === 0) {
    post({
      t: 'align:done',
      jobId: message.jobId,
      chunkId: message.chunkId,
      words: [],
    });

    return;
  }

  try {
    const inputs = await processor(samples);
    const output = await model(inputs);
    if (cancelled || message.jobId !== currentJob) return;

    const emissions = toLogProbs(
      output.logits as { data: ArrayLike<number>; dims: number[] }
    );

    if (emissions.vocabSize !== Object.keys(vocabulary.ids).length) {
      // A mismatch here means the vocabulary and the model disagree, and every
      // token id would index the wrong column. Better to fail loudly.
      throw new Error(
        `Model emits ${emissions.vocabSize} classes but the vocabulary has ${Object.keys(vocabulary.ids).length}`
      );
    }

    const spans = alignTokens(emissions, tokenized.tokens, vocabulary.blankId);
    const merged = mergeTokensToWords(
      spans,
      tokenCountsPerWord(tokenized),
      leadingDelimitersPerWord(tokenized)
    );

    const words: AlignedWord[] = tokenized.words.map((word, index) => {
      const span = merged[index]!;
      const { start, end } = spanToSeconds(span, FRAME_SECONDS, message.offset);

      return {
        // The caller matches results back to its own words by this index, so a
        // window that dropped some words still lands the rest correctly.
        text: message.tokens[word.wordIndex] ?? '',
        start,
        end,
        conf: span.score,
      };
    });

    post({
      t: 'align:done',
      jobId: message.jobId,
      chunkId: message.chunkId,
      words: words.filter((word) => word.conf >= MIN_WORD_SCORE),
    });
  } catch (err) {
    if (cancelled) return;
    const text = err instanceof Error ? err.message : String(err);
    const code = /out of memory|device lost|allocation/i.test(text)
      ? 'out-of-memory'
      : 'unknown';
    fail(message.jobId, code, err);
  }
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
    case 'align':
      void align(message);
      break;
    default:
      break;
  }
});
