import type { Cue, Word } from './types';

/**
 * Subtitle serialisation. A pure function of `(Word[], Cue[])` — no DOM, no
 * worker, no model — which is what makes it testable in Node.
 */

export type ExportFormat = 'srt' | 'vtt' | 'json';

/** A cue's effective bounds: a human's dragged override wins over the words. */
export function cueBounds(
  cue: Cue,
  words: Word[]
): { start: number; end: number } {
  const first = words[cue.wordStart];
  const last = words[cue.wordEnd];

  return {
    start: cue.overrideStart ?? first?.start ?? 0,
    end: cue.overrideEnd ?? last?.end ?? 0,
  };
}

/**
 * Renders a cue's text with its line breaks applied.
 *
 * `lineBreaks` holds word indices *before which* a break occurs, so a break at
 * the cue's first word would produce a leading empty line and is ignored.
 */
export function cueText(cue: Cue, words: Word[]): string {
  const breaks = new Set(cue.lineBreaks);
  let out = '';

  for (let i = cue.wordStart; i <= cue.wordEnd; i += 1) {
    const word = words[i];
    if (!word) continue;
    if (i !== cue.wordStart) out += breaks.has(i) ? '\n' : ' ';
    out += word.text;
  }

  return out;
}

/**
 * Formats seconds as a subtitle timestamp.
 *
 * SRT uses a comma before the milliseconds, WebVTT a period — the only
 * difference between the two timestamp forms. Negative input is clamped to zero
 * rather than producing a `-00:00:01,000` that no player accepts.
 */
export function formatTimestamp(
  seconds: number,
  msSeparator: ',' | '.'
): string {
  const total = Math.max(0, seconds);
  const ms = Math.round(total * 1000);

  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;

  const pad = (value: number, width = 2) => String(value).padStart(width, '0');

  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}${msSeparator}${pad(millis, 3)}`;
}

/** SubRip. 1-indexed cue numbers, comma before milliseconds, blank line between cues. */
export function toSrt(words: Word[], cues: Cue[]): string {
  return (
    cues
      .map((cue, index) => {
        const { start, end } = cueBounds(cue, words);

        return [
          String(index + 1),
          `${formatTimestamp(start, ',')} --> ${formatTimestamp(end, ',')}`,
          cueText(cue, words),
        ].join('\n');
      })
      // A trailing blank line after the final cue is conventional and some
      // parsers require it to terminate the last block.
      .join('\n\n') + '\n'
  );
}

/** WebVTT. Requires the `WEBVTT` header; period before milliseconds. */
export function toVtt(words: Word[], cues: Cue[]): string {
  const blocks = cues.map((cue) => {
    const { start, end } = cueBounds(cue, words);

    return [
      `${formatTimestamp(start, '.')} --> ${formatTimestamp(end, '.')}`,
      cueText(cue, words),
    ].join('\n');
  });

  return `WEBVTT\n\n${blocks.join('\n\n')}\n`;
}

/**
 * Lossless JSON. Exports words *and* cues, so a transcript can round-trip back
 * into the editor with per-word timing, confidence and lock state intact —
 * which neither SRT nor VTT can carry.
 */
export function toJson(words: Word[], cues: Cue[]): string {
  return JSON.stringify(
    {
      version: 1,
      words,
      cues: cues.map((cue) => ({
        ...cue,
        ...cueBounds(cue, words),
        text: cueText(cue, words),
      })),
    },
    null,
    2
  );
}

export function serialize(
  format: ExportFormat,
  words: Word[],
  cues: Cue[]
): string {
  switch (format) {
    case 'srt':
      return toSrt(words, cues);
    case 'vtt':
      return toVtt(words, cues);
    case 'json':
      return toJson(words, cues);
  }
}

export const EXPORT_MIME: Record<ExportFormat, string> = {
  // `application/x-subrip` is the registered type; text/plain is what most
  // browsers infer, and using the specific type keeps downloads named correctly.
  srt: 'application/x-subrip',
  vtt: 'text/vtt',
  json: 'application/json',
};

export const EXPORT_EXTENSION: Record<ExportFormat, string> = {
  srt: '.srt',
  vtt: '.vtt',
  json: '.json',
};
