import { ALIGNER, ASR, CACHE_KEY, VAD } from './config';

/**
 * What is cached, how big it is, and how to get rid of it.
 *
 * M5's model manager. The tool downloads 151 MB before the first word and another
 * 189 MB if someone opts into accurate timing, and then keeps it — which is the whole
 * point, since the second visit is instant. But storing a third of a gigabyte on
 * somebody's device without ever telling them, or giving them a way to remove it, is
 * not a defensible thing for a free tool to do. "It runs on your device, nothing is
 * uploaded" is the promise this page makes; the corollary is that the user owns what
 * lands there and should be able to see and clear it.
 *
 * Reads the Cache API directly rather than trusting the manifest's `approxBytes`.
 * What matters here is what is *actually on disk*, and those two numbers disagree the
 * moment a dtype changes or a download is interrupted partway.
 */

export interface CachedModel {
  id: string;
  label: string;
  /** Files present in the cache for this model at its pinned revision. */
  files: number;
  /** Real bytes, summed from the cached responses. */
  bytes: number;
  /** Whether every file the model needs appears to be present. */
  complete: boolean;
}

export interface CacheReport {
  models: CachedModel[];
  totalBytes: number;
  /** Storage the origin is permitted, in bytes, or null when unreported. */
  quotaBytes: number | null;
  /** Everything the origin has stored, not just ours. */
  originUsageBytes: number | null;
}

const TRACKED = [
  {
    id: ASR.id,
    revision: ASR.revision,
    weightFiles: ASR.weightFiles,
    label: 'Speech recognition (Whisper)',
  },
  {
    id: ALIGNER.id,
    revision: ALIGNER.revision,
    weightFiles: ALIGNER.weightFiles,
    label: 'Word timing (wav2vec2)',
  },
  {
    id: VAD.id,
    revision: VAD.revision,
    weightFiles: VAD.weightFiles,
    label: 'Speech detection (Silero)',
  },
];

/** Cache entries for this model at this revision. */
function entriesFor(
  keys: readonly Request[],
  id: string,
  revision: string
): Request[] {
  // Matched on id *and* revision: weights from a superseded revision are not
  // this model, and counting them would make a stale cache look healthy.
  return keys.filter(
    (request) => request.url.includes(id) && request.url.includes(revision)
  );
}

/**
 * Whether every weight file the model needs is present.
 *
 * Counts `.onnx` entries against the model's own `weightFiles`. The previous
 * test — "three or more cached files of any kind" — was a single constant
 * applied to three models with different shapes, and Silero has exactly one file
 * in its entire repository. It could never pass, so a healthy VAD cache rendered
 * as "incomplete" and `isModelCached` re-quoted its download on every visit.
 */
function isComplete(entries: readonly Request[], weightFiles: number): boolean {
  return (
    entries.filter((request) => request.url.endsWith('.onnx')).length >=
    weightFiles
  );
}

/**
 * Size of a cached response.
 *
 * `content-length` first because reading it is free. Falling back to buffering the
 * body is the slow path but it is the only correct one for an opaque or chunked
 * response, and reporting 0 bytes for a 123 MB file would make the whole screen a
 * lie.
 */
async function sizeOf(response: Response): Promise<number> {
  const header = response.headers.get('content-length');
  if (header !== null) {
    const parsed = Number.parseInt(header, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  try {
    return (await response.clone().blob()).size;
  } catch {
    return 0;
  }
}

export async function readCache(): Promise<CacheReport> {
  const empty: CacheReport = {
    models: [],
    totalBytes: 0,
    quotaBytes: null,
    originUsageBytes: null,
  };

  if (typeof caches === 'undefined') return empty;

  let estimate: StorageEstimate | undefined;
  try {
    estimate = await globalThis.navigator?.storage?.estimate?.();
  } catch {
    // Unreported, not zero.
  }

  let cache: Cache;
  try {
    cache = await caches.open(CACHE_KEY);
  } catch {
    return empty;
  }

  const keys = await cache.keys();
  const models: CachedModel[] = [];

  for (const tracked of TRACKED) {
    const mine = entriesFor(keys, tracked.id, tracked.revision);

    let bytes = 0;
    for (const request of mine) {
      const response = await cache.match(request);
      if (response) bytes += await sizeOf(response);
    }

    models.push({
      id: tracked.id,
      label: tracked.label,
      files: mine.length,
      bytes,
      complete: isComplete(mine, tracked.weightFiles),
    });
  }

  return {
    models,
    totalBytes: models.reduce((sum, model) => sum + model.bytes, 0),
    quotaBytes: estimate?.quota ?? null,
    originUsageBytes: estimate?.usage ?? null,
  };
}

/**
 * Whether a model's weights are already on this device.
 *
 * Deliberately not `readCache()`. That one sums real bytes, which means reading
 * every cached response and — for anything without a `content-length` — buffering
 * a 189 MB body. This question only needs the key list, so it costs one
 * `cache.keys()` and no reads. It is asked on render, by UI deciding whether to
 * quote a download size; `readCache` is asked once, by a panel the user opened.
 *
 * Same test as `complete` in `readCache`, so the two can never disagree about
 * whether a model is on the device.
 */
export async function isModelCached(
  id: string,
  revision: string,
  weightFiles: number
): Promise<boolean> {
  if (typeof caches === 'undefined') return false;

  try {
    const cache = await caches.open(CACHE_KEY);
    const keys = await cache.keys();

    return isComplete(entriesFor(keys, id, revision), weightFiles);
  } catch {
    // A browser that will not open the cache is one we cannot prove anything
    // about; quoting the download size is the safe answer.
    return false;
  }
}

/** Removes one model's cached files. Returns how many were deleted. */
export async function purgeModel(id: string): Promise<number> {
  if (typeof caches === 'undefined') return 0;

  const cache = await caches.open(CACHE_KEY);
  const keys = await cache.keys();
  const mine = keys.filter((request) => request.url.includes(id));

  let deleted = 0;
  for (const request of mine) {
    if (await cache.delete(request)) deleted += 1;
  }

  return deleted;
}

/**
 * Removes everything this tool has cached.
 *
 * Deletes the whole named cache rather than iterating its keys: it also clears
 * entries from superseded revisions, which per-model purging by id would miss and
 * which are exactly the bytes a user wanting their space back cares about.
 */
export async function purgeAll(): Promise<boolean> {
  if (typeof caches === 'undefined') return false;

  return caches.delete(CACHE_KEY);
}
