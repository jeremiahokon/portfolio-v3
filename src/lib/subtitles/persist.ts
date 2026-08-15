import type { Cue, TimingSource, Word } from './types';

/**
 * Autosaves the transcript so a closed tab does not cost half an hour of work.
 *
 * **Moved from M5 to M3 deliberately (D19).** The editor is where the user
 * *invests* sustained attention — reading 39 minutes of audio and correcting
 * names one by one — and that investment is exactly what makes losing it
 * unacceptable. A transcription can always be re-run; an hour of corrections
 * cannot. It is also far cheaper to add now than to retrofit around an editor
 * built assuming ephemeral state.
 *
 * IndexedDB rather than localStorage: a 39-minute transcript is roughly 5,800
 * words and about a megabyte of JSON, comfortably past what localStorage should
 * hold, and localStorage writes are synchronous on the main thread.
 *
 * Keyed by file identity *and* model revision. A transcript produced by a
 * different model is a different transcript, and silently restoring one over the
 * other would be worse than not restoring at all.
 */

const DB_NAME = 'subtitles-drafts';
const STORE = 'drafts';
const VERSION = 1;

export interface Draft {
  key: string;
  fileName: string;
  duration: number;
  words: Word[];
  cues: Cue[];
  timingSource: TimingSource;
  /** Epoch milliseconds, for "restored from an hour ago" and for pruning. */
  savedAt: number;
}

/** Drafts older than this are pruned on open. */
export const DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Identifies a draft by content, not by name.
 *
 * Name and size alone would collide across trimmed exports of the same recording,
 * and hashing the whole file would mean reading hundreds of megabytes to decide
 * whether to offer a restore. Name, size, mtime and model revision together are
 * specific enough for a local draft and cost nothing to compute.
 */
export function draftKey(file: File, modelRevision: string): string {
  return [file.name, file.size, file.lastModified, modelRevision].join(':');
}

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);

  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, VERSION);
    } catch {
      // Private browsing modes can throw on open rather than fail the request.
      resolve(null);

      return;
    }

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    // Never reject: autosave is a convenience, and a browser that will not give
    // us storage must not take the editor down with it.
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function tx<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      const request = run(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Writes a draft, replacing any previous one for the same key.
 *
 * Swallows quota errors on purpose. The alternative — surfacing "could not
 * autosave" over an editor that is working perfectly well — trains people to
 * dismiss warnings, and the user has lost nothing they had a moment ago.
 */
export async function saveDraft(draft: Omit<Draft, 'savedAt'>): Promise<void> {
  const db = await open();
  if (!db) return;

  await tx(db, 'readwrite', (store) =>
    store.put({ ...draft, savedAt: Date.now() } satisfies Draft)
  );
  db.close();
}

export async function loadDraft(key: string): Promise<Draft | null> {
  const db = await open();
  if (!db) return null;

  const draft = await tx<Draft>(db, 'readonly', (store) => store.get(key));
  db.close();

  if (!draft) return null;
  if (Date.now() - draft.savedAt > DRAFT_TTL_MS) {
    void deleteDraft(key);

    return null;
  }

  return draft;
}

export async function deleteDraft(key: string): Promise<void> {
  const db = await open();
  if (!db) return;

  await tx(db, 'readwrite', (store) => store.delete(key));
  db.close();
}

/**
 * Removes expired drafts.
 *
 * A tool that quietly accumulates megabytes of other people's meeting transcripts
 * in browser storage is a tool that deserves the complaint it will get.
 */
/**
 * Marks that a transcription is in flight, so a crash can be told from a visit.
 *
 * When Safari runs out of memory it kills the tab and reloads it. From the
 * user's side that is indistinguishable from arriving fresh — the page comes
 * back at step one with no error and no explanation, and they watch it happen
 * again. That is the whole of the reported symptom: not that it failed, but that
 * it failed *silently*, on a loop.
 *
 * `sessionStorage`, not IndexedDB: this must be readable synchronously on mount,
 * before anything renders, and it must not outlive the tab. A marker that
 * survived into a genuinely new session would accuse a working browser of a
 * crash that never happened. Writes are wrapped because Safari's private mode
 * throws on `setItem` rather than failing quietly — and a diagnostic aid must
 * never be the thing that breaks the tool.
 */
const IN_FLIGHT_KEY = 'subtitles-job-in-flight';

export interface InFlightJob {
  fileName: string;
  /** Audio duration in seconds, so the notice can be specific. */
  duration: number;
}

export function markJobInFlight(job: InFlightJob): void {
  try {
    globalThis.sessionStorage?.setItem(IN_FLIGHT_KEY, JSON.stringify(job));
  } catch {
    // Storage disabled. The job still runs; only the post-crash notice is lost.
  }
}

/** Called on success *and* on any handled failure — both mean "not a crash". */
export function clearJobInFlight(): void {
  try {
    globalThis.sessionStorage?.removeItem(IN_FLIGHT_KEY);
  } catch {
    // Nothing to do; a stale marker costs one dismissable notice.
  }
}

/**
 * Reads the marker without consuming it.
 *
 * **Read-only on purpose.** The obvious shape here is read-and-clear, so the
 * notice shows once — and it is wrong, because the caller is a React effect and
 * StrictMode runs effects twice on mount in development. The first pass would
 * consume the marker and the second would read `null` and render nothing, which
 * is exactly the silence this whole mechanism exists to remove. Anything that
 * can run twice must be safe to run twice.
 *
 * Clearing is therefore the job of `clearJobInFlight`, called when a new job
 * starts. Until then the notice survives repeated reloads, which is also the
 * honest behaviour: nothing has changed, so the explanation still applies. It
 * dies with the tab regardless, because this is `sessionStorage`.
 */
export function peekInterruptedJob(): InFlightJob | null {
  let raw: string | null = null;
  try {
    raw = globalThis.sessionStorage?.getItem(IN_FLIGHT_KEY) ?? null;
  } catch {
    return null;
  }
  if (raw === null) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<InFlightJob>;
    if (typeof parsed.fileName !== 'string') return null;

    return {
      fileName: parsed.fileName,
      duration: typeof parsed.duration === 'number' ? parsed.duration : 0,
    };
  } catch {
    return null;
  }
}

export async function pruneDrafts(now: number = Date.now()): Promise<number> {
  const db = await open();
  if (!db) return 0;

  const all = await tx<Draft[]>(db, 'readonly', (store) => store.getAll());
  const stale = (all ?? []).filter((d) => now - d.savedAt > DRAFT_TTL_MS);

  for (const draft of stale) {
    await tx(db, 'readwrite', (store) => store.delete(draft.key));
  }
  db.close();

  return stale.length;
}
