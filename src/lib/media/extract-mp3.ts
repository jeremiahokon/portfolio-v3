import type { FFFSType, FFmpeg } from '@ffmpeg/ffmpeg';

import { baseName } from '@/lib/utils';

/**
 * Video (or audio) file → a listenable MP3.
 *
 * Extracted from the audio extractor so the subtitles tool can offer the same
 * download without a second, subtly-different copy of the command. **There is
 * exactly one definition of what "the MP3" means in this codebase**, and that
 * matters more than the few lines it saves: a divergence here would mean the two
 * tools hand back different-sounding files from the same source, which is the kind
 * of inconsistency nobody reports and everybody notices.
 *
 * **Why the subtitles pipeline cannot just reuse what it already decoded.** It
 * decodes to 16 kHz mono `pcm_s16le` for Whisper (`decode-pcm.ts`), which is
 * speech-recognition grade and not something to hand a person as "your audio" —
 * mono, badly undersampled for music, and uncompressed. So this is a genuinely
 * separate pass. It is cheap rather than free: the ~32 MB FFmpeg core is shared
 * between both tools (D8) and already warm by the time a transcription finishes, so
 * the cost is one `exec` rather than a fresh engine load.
 *
 * `-q:a 2` is libmp3lame's VBR quality 2 — roughly 190 kbps — chosen when the
 * extractor shipped and kept here verbatim so its output does not change.
 */

/** libmp3lame VBR quality. Lower is better; 2 is transparent for speech. */
export const MP3_QUALITY = '2';

export interface Mp3Result {
  blob: Blob;
  name: string;
}

/**
 * Log lines are not taken as a parameter: both callers already subscribe to the
 * shared engine's logs to keep a tail for error classification, and handing this
 * function a second channel to the same lines would just be two ways to miss one.
 *
 * @param ffmpeg An already-loaded engine, from `getEngine()`.
 */
export async function extractMp3(
  ffmpeg: FFmpeg,
  file: File
): Promise<Mp3Result> {
  // Mounted by reference: WORKERFS reads the File lazily from disk, so a
  // multi-gigabyte video never enters WASM memory. Only the MP3 output and
  // FFmpeg's working buffers live in linear memory.
  const dir = '/mount';
  const inputPath = `${dir}/${file.name}`;
  const outputName = `${baseName(file.name)}.mp3`;
  let mounted = false;

  try {
    await ffmpeg.createDir(dir).catch(() => undefined);
    // `FFFSType.WORKERFS` is a string enum ("WORKERFS"); passing the literal
    // avoids depending on the enum being re-exported as a runtime value.
    await ffmpeg.mount('WORKERFS' as FFFSType, { files: [file] }, dir);
    mounted = true;

    await ffmpeg.exec([
      '-i',
      inputPath,
      '-vn',
      '-c:a',
      'libmp3lame',
      '-q:a',
      MP3_QUALITY,
      outputName,
    ]);

    const data = await ffmpeg.readFile(outputName);
    // Copied into a fresh Uint8Array so the Blob owns its bytes independently of
    // FFmpeg's WASM heap, which is freed and reused after this call.
    const bytes = new Uint8Array(data as Uint8Array);

    return {
      blob: new Blob([bytes], { type: 'audio/mpeg' }),
      name: outputName,
    };
  } finally {
    // Always, even when exec throws: a dirty /mount makes the next attempt fail.
    await ffmpeg.deleteFile(outputName).catch(() => undefined);
    if (mounted) await ffmpeg.unmount(dir).catch(() => undefined);
    await ffmpeg.deleteDir(dir).catch(() => undefined);
  }
}

/**
 * Turns FFmpeg's log tail into a message worth showing someone.
 *
 * Shared for the same reason as the command: both tools should explain the same
 * failure the same way.
 */
export function describeMp3Failure(logTail: string): string {
  return logTail.includes('does not contain any stream') ||
    logTail.includes('Output file is empty')
    ? 'This file doesn’t seem to have an audio track.'
    : 'Extraction failed — the file may be corrupted or in an unsupported format.';
}
