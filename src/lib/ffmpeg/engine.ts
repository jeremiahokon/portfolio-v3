import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

/**
 * Shared FFmpeg engine host.
 *
 * The only thing the audio extractor and the subtitle pipeline genuinely share
 * is the expensive part: fetching and instantiating a ~32 MB WASM core. They do
 * not share a decode layer — one wants an MP3 file the user downloads, the
 * other wants raw PCM the pipeline consumes — so this module deliberately owns
 * loading and caching only. Command construction, progress semantics and error
 * taxonomy stay with each caller.
 *
 * Single-threaded core: no SharedArrayBuffer, so the page needs no
 * cross-origin isolation (COOP/COEP) headers. That deliberately avoids the
 * multi-threaded core's module-worker chunk, which Vercel's edge blocks with
 * ERR_BLOCKED_BY_RESPONSE in a require-corp context — the extractor hung on
 * "Warming up the audio engine" in production as a result. There is no
 * ffmpeg-core.worker.js in the single-threaded build, so no workerURL.
 *
 * Not runtime-selected by `crossOriginIsolated`: a threaded-core branch would
 * be permanently dead code here (see the comment block in next.config.ts) and
 * would invite someone to re-add `require-corp` and re-break both tools.
 */

const BASE_URL = '/ffmpeg';

type LogHandler = (message: string) => void;
type ProgressHandler = (ratio: number) => void;

const logHandlers = new Set<LogHandler>();
const progressHandlers = new Set<ProgressHandler>();

let engine: FFmpeg | null = null;
// Held separately from `engine` so concurrent callers await one load rather
// than racing two `ffmpeg.load()` calls against the same 32 MB fetch.
let loading: Promise<FFmpeg> | null = null;

export interface EngineHandlers {
  /** Every engine log line, in order. Callers keep their own tail if they want one. */
  onLog?: LogHandler;
  /** Clamped 0..1 progress ratio from the engine's own `progress` event. */
  onProgress?: ProgressHandler;
}

/**
 * Subscribes to engine output for the lifetime of one job.
 *
 * Handlers are registered per call rather than per engine so two tools can
 * share the instance without seeing each other's logs. Always call the
 * returned function when the job ends — a leaked handler keeps a closure over
 * component state alive for the page's lifetime.
 */
export function subscribeEngine({
  onLog,
  onProgress,
}: EngineHandlers): () => void {
  if (onLog) logHandlers.add(onLog);
  if (onProgress) progressHandlers.add(onProgress);

  return () => {
    if (onLog) logHandlers.delete(onLog);
    if (onProgress) progressHandlers.delete(onProgress);
  };
}

/**
 * Returns the shared engine, loading it on first call.
 *
 * Assumes a single job at a time. The engine owns one virtual filesystem, so
 * two concurrent callers would collide on mount points and output paths — both
 * tools live on separate routes and both guard their own UI while busy, so this
 * holds today. Revisit before running two jobs in one page.
 */
export async function getEngine(signal?: AbortSignal): Promise<FFmpeg> {
  signal?.throwIfAborted();
  if (engine) return engine;
  if (loading) return loading;

  loading = (async () => {
    const ffmpeg = new FFmpeg();

    ffmpeg.on('progress', ({ progress: ratio }) => {
      const clamped = Math.min(1, Math.max(0, ratio));
      for (const handler of progressHandlers) handler(clamped);
    });
    ffmpeg.on('log', ({ message }) => {
      for (const handler of logHandlers) handler(message);
    });

    await ffmpeg.load({
      coreURL: await toBlobURL(`${BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(
        `${BASE_URL}/ffmpeg-core.wasm`,
        'application/wasm'
      ),
      ...(signal ? { signal } : {}),
    });

    engine = ffmpeg;

    return ffmpeg;
  })();

  try {
    return await loading;
  } catch (err) {
    // Drop the rejected promise so a retry re-attempts the load instead of
    // re-throwing the same cached failure forever.
    loading = null;
    throw err;
  }
}

/** True once the core is resident, so callers can skip a "loading engine" state. */
export function isEngineLoaded(): boolean {
  return engine !== null;
}

/**
 * Tears the engine down and releases the WASM instance and its worker.
 *
 * Without this the worker and ~32 MB heap stay resident for the page's life
 * after a job finishes. Callers that terminate must not hold a reference to the
 * old instance — the next `getEngine()` builds a fresh one.
 */
export function terminateEngine(): void {
  const current = engine;
  engine = null;
  loading = null;
  logHandlers.clear();
  progressHandlers.clear();
  current?.terminate();
}
