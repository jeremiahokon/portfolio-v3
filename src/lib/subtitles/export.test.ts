import { describe, expect, it } from 'vitest';

import {
  cueBounds,
  cueText,
  formatTimestamp,
  serialize,
  toJson,
  toSrt,
  toVtt,
} from './export';
import type { Cue, Word } from './types';

function word(text: string, start: number, end: number): Word {
  return {
    id: text,
    text,
    origText: text,
    start,
    end,
    conf: 0.9,
    edited: false,
    timeLocked: false,
  };
}

const words: Word[] = [
  word('The', 0.5, 0.72),
  word('quick', 0.72, 1.1),
  word('brown', 1.1, 1.48),
  word('fox', 1.48, 1.9),
  word('jumps', 3671.2, 3672.05),
];

const cues: Cue[] = [
  { id: 'c1', wordStart: 0, wordEnd: 3, lineBreaks: [2] },
  { id: 'c2', wordStart: 4, wordEnd: 4, lineBreaks: [], overrideEnd: 3673.5 },
];

describe('formatTimestamp', () => {
  it('pads to hours:minutes:seconds,milliseconds', () => {
    expect(formatTimestamp(0, ',')).toBe('00:00:00,000');
  });

  it('rolls over into hours', () => {
    expect(formatTimestamp(3661.5, ',')).toBe('01:01:01,500');
    expect(formatTimestamp(3671.2, ',')).toBe('01:01:11,200');
  });

  it('clamps negatives instead of emitting a timestamp no player accepts', () => {
    expect(formatTimestamp(-5, ',')).toBe('00:00:00,000');
  });

  it('rounds to the nearest millisecond and carries into seconds', () => {
    expect(formatTimestamp(0.9999, ',')).toBe('00:00:01,000');
  });

  it('uses a period for WebVTT', () => {
    expect(formatTimestamp(1.25, '.')).toBe('00:00:01.250');
  });
});

describe('cueText', () => {
  it('applies line breaks at the recorded word indices', () => {
    expect(cueText(cues[0]!, words)).toBe('The quick\nbrown fox');
  });

  it('joins with spaces when there are no breaks', () => {
    expect(
      cueText({ id: 'x', wordStart: 0, wordEnd: 2, lineBreaks: [] }, words)
    ).toBe('The quick brown');
  });
});

describe('cueBounds', () => {
  it('derives bounds from the first and last word', () => {
    expect(cueBounds(cues[0]!, words)).toEqual({ start: 0.5, end: 1.9 });
  });

  it('lets a human override win over the word timing', () => {
    expect(cueBounds(cues[1]!, words)).toEqual({
      start: 3671.2,
      end: 3673.5,
    });
  });
});

describe('toSrt', () => {
  const srt = toSrt(words, cues);

  it('numbers cues from one', () => {
    expect(srt.startsWith('1\n')).toBe(true);
    expect(srt).toContain('\n2\n');
  });

  it('uses a comma before milliseconds and an arrow between bounds', () => {
    expect(srt).toContain('00:00:00,500 --> 00:00:01,900');
  });

  it('separates cues with a blank line and terminates the last one', () => {
    expect(srt).toBe(
      '1\n00:00:00,500 --> 00:00:01,900\nThe quick\nbrown fox\n\n' +
        '2\n01:01:11,200 --> 01:01:13,500\njumps\n'
    );
  });

  it('emits just a newline for an empty transcript', () => {
    expect(toSrt([], [])).toBe('\n');
  });
});

describe('toVtt', () => {
  it('starts with the required WEBVTT header', () => {
    expect(toVtt(words, cues).startsWith('WEBVTT\n\n')).toBe(true);
  });

  it('uses a period before milliseconds', () => {
    expect(toVtt(words, cues)).toContain('00:00:00.500 --> 00:00:01.900');
  });
});

describe('toJson', () => {
  const parsed = JSON.parse(toJson(words, cues));

  it('keeps every word with its timing, confidence and lock state', () => {
    expect(parsed.words).toHaveLength(words.length);
    expect(parsed.words[0]).toMatchObject({
      text: 'The',
      start: 0.5,
      conf: 0.9,
    });
  });

  it('resolves each cue to concrete bounds and text', () => {
    expect(parsed.cues[1]).toMatchObject({
      start: 3671.2,
      end: 3673.5,
      text: 'jumps',
    });
  });

  it('round-trips losslessly', () => {
    expect(JSON.parse(toJson(parsed.words, cues)).words).toEqual(parsed.words);
  });
});

describe('serialize', () => {
  it('dispatches on format', () => {
    expect(serialize('srt', words, cues)).toBe(toSrt(words, cues));
    expect(serialize('vtt', words, cues)).toBe(toVtt(words, cues));
    expect(serialize('json', words, cues)).toBe(toJson(words, cues));
  });
});
