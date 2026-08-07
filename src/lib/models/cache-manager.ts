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
  { id: ASR.id, revision: ASR.revision, label: 'Speech recognition (Whisper)' },
  {
    id: ALIGNER.id,
    revision: ALIGNER.revision,
    label: 'Word timing (wav2vec2)',
  },
  { id: VAD.id, revision: VAD.revision, label: 'Speech detection (Silero)' },
];

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
    // Matched on id *and* revision: weights from a superseded revision are not this
    // model, and counting them here would make a stale cache look healthy.
    const mine = keys.filter(
      (request) =>
        request.url.includes(tracked.id) &&
        request.url.includes(tracked.revision)
    );

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
      // A model needs weights plus a tokenizer and configs. Fewer than three files
      // means an interrupted download, which is worth showing as incomplete rather
      // than as a working cache that will fail on next use.
      complete: mine.length >= 3,
    });
  }

  return {
    models,
    totalBytes: models.reduce((sum, model) => sum + model.bytes, 0),
    quotaBytes: estimate?.quota ?? null,
    originUsageBytes: estimate?.usage ?? null,
  };
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
