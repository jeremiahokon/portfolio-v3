import type { ChunkResult } from './stitch';

/**
 * Per-chunk checkpointing, so a long job survives a reload.
 *
 * The 39-minute file took 94 windows and about 25 minutes. Losing all of it to a
 * closed tab, a crash, or a phone deciding to reclaim the page is the single worst
 * outcome this tool can produce — the user has spent 151 MB of download and half an
 * hour and has nothing. Checkpointing turns that into "pick up at window 71".
 *
 * **OPFS, not IndexedDB**, and for once not out of preference: this writes after
 * every window, ninety-odd times, while a model is resident and the main thread is
 * busy. OPFS gives a plain file per job with cheap appends and no transaction
 * machinery in the way. Drafts of a *finished* transcript go to IndexedDB
 * (`persist.ts`) because that is a single structured record read once — a different
 * problem deserving a different store.
 *
 * **Only ASR results are checkpointed, deliberately.** Decode and VAD are minutes at
 * most and reproduce identically from the same file; the expensive, irreproducible
 * part is Whisper's output per window. Storing the decoded PCM as well would mean
 * writing ~58 MB per 30 minutes to disk to save a step that costs far less than that
 * to redo.
 */

/** Bumped when the record shape changes, so old checkpoints are ignored not misread. */
const FORMAT = 1;
const DIR = 'subtitle-checkpoints';

interface Checkpoint {
  format: number;
  /** File identity plus model revision — see `draftKey`. */
  key: string;
  /** How many windows the plan had, so a changed plan invalidates the resume. */
  chunkCount: number;
  results: ChunkResult[];
  savedAt: number;
}

async function directory(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const root = await navigator.storage?.getDirectory?.();
    if (!root) return null;

    return await root.getDirectoryHandle(DIR, { create: true });
  } catch {
    // OPFS is absent (older Safari) or blocked (private browsing). Checkpointing is
    // an optimisation, so its absence must never be an error.
    return null;
  }
}

/** Filenames must survive a key containing slashes and colons. */
function fileName(key: string): string {
  return `${encodeURIComponent(key)}.json`;
}

/**
 * Writes the results so far.
 *
 * The whole record is rewritten each time rather than appended to. At 94 windows and
 * a few kilobytes of segments each, the file stays well under a megabyte, and one
 * atomic write per window cannot leave a half-written record the way an interrupted
 * append can. Correctness is worth more than the writes saved.
 */
export async function saveCheckpoint(
  key: string,
  chunkCount: number,
  results: ChunkResult[]
): Promise<void> {
  const dir = await directory();
  if (!dir) return;

  try {
    const handle = await dir.getFileHandle(fileName(key), { create: true });
    const writable = await handle.createWritable();
    await writable.write(
      JSON.stringify({
        format: FORMAT,
        key,
        chunkCount,
        results,
        savedAt: Date.now(),
      } satisfies Checkpoint)
    );
    await writable.close();
  } catch {
    // A full disk must not fail a job that is otherwise going fine.
  }
}

/**
 * Reads a resumable checkpoint, or null.
 *
 * Returns null when the window count differs, because the results are indexed by
 * chunk id: resuming against a different plan would attribute one window's
 * transcript to another window's audio, which is worse than redoing the work.
 */
export async function loadCheckpoint(
  key: string,
  chunkCount: number
): Promise<ChunkResult[] | null> {
  const dir = await directory();
  if (!dir) return null;

  try {
    const handle = await dir.getFileHandle(fileName(key));
    const parsed: unknown = JSON.parse(await (await handle.getFile()).text());
    const checkpoint = parsed as Checkpoint;

    if (checkpoint.format !== FORMAT) return null;
    if (checkpoint.key !== key) return null;
    if (checkpoint.chunkCount !== chunkCount) return null;
    if (!Array.isArray(checkpoint.results) || checkpoint.results.length === 0) {
      return null;
    }

    return checkpoint.results;
  } catch {
    return null;
  }
}

export async function clearCheckpoint(key: string): Promise<void> {
  const dir = await directory();
  if (!dir) return;

  try {
    await dir.removeEntry(fileName(key));
  } catch {
    // Already gone.
  }
}

/**
 * Deletes every checkpoint.
 *
 * A completed job clears its own, but a cancelled or crashed one leaves its file
 * behind, and a tool that silently accumulates other people's partial meeting
 * transcripts on disk deserves the complaint it will get. Called from the model
 * manager, alongside purging weights.
 */
export async function clearAllCheckpoints(): Promise<number> {
  const dir = await directory();
  if (!dir) return 0;

  let removed = 0;
  try {
    // `keys()` is async-iterable on OPFS directory handles.
    for await (const name of (
      dir as unknown as { keys: () => AsyncIterableIterator<string> }
    ).keys()) {
      await dir.removeEntry(name).then(
        () => {
          removed += 1;
        },
        () => undefined
      );
    }
  } catch {
    return removed;
  }

  return removed;
}
