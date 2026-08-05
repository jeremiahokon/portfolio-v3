/**
 * The data contract for the subtitle pipeline.
 *
 * **Words are the single source of truth. Cues are a derived view.** Every
 * downstream stage — stitching, cue building, export, re-alignment — is a
 * function over `Word[]`, and cues only ever hold *indices* into that array.
 *
 * Two invariants follow, and they are the reason the tool can re-time an edit
 * cheaply instead of re-transcribing:
 *
 * 1. Editing a word's `text` must never touch its `start`/`end`.
 * 2. Split, merge and re-segment only rewrite index ranges, which makes them
 *    lossless and trivially undoable.
 */

export interface Word {
  id: string;
  /** User-editable. Changing this must not alter `start`/`end`. */
  text: string;
  /** As recognised, kept so an edit can be diffed against the original. */
  origText: string;
  /** Seconds. From the aligner when available, otherwise an ASR segment bound. */
  start: number;
  /** Seconds. */
  end: number;
  /** 0..1 alignment score. Low values are surfaced in the QC panel. */
  conf: number;
  /** Set true on text change, marking the region for re-alignment. */
  edited: boolean;
  /** The user dragged this boundary; the aligner must not overwrite it. */
  timeLocked: boolean;
}

export interface Cue {
  id: string;
  /** Index into `Word[]`. */
  wordStart: number;
  /** Index into `Word[]`, inclusive. */
  wordEnd: number;
  /** Word indices at which a line break occurs. */
  lineBreaks: number[];
  /** Set only when a human drags the cue's start handle. */
  overrideStart?: number;
  /** Set only when a human drags the cue's end handle. */
  overrideEnd?: number;
}

/**
 * Where a word's timing came from.
 *
 * This is a first-class part of the model because the tool ships in two stages:
 * the ~169 MB Whisper download alone yields `estimated` timings derived from
 * coarse (~1 s granular) ASR segment bounds, and the aligner is an explicit
 * opt-in second download that upgrades them to `aligned`. Every cue and export
 * path must be correct under both.
 */
export type TimingSource = 'estimated' | 'aligned';

/** One planned analysis window over the decoded audio. */
export interface Chunk {
  id: number;
  /** Seconds into the source audio. */
  start: number;
  /** Seconds into the source audio. */
  end: number;
  /**
   * Seconds of leading audio included for context but whose words are dropped
   * when stitching, because the previous chunk already owns them.
   */
  overlapStart: number;
  /** Trailing counterpart to `overlapStart`. */
  overlapEnd: number;
}

/** A raw ASR result before alignment. Timestamps here are coarse. */
export interface AsrSegment {
  text: string;
  start: number;
  end: number;
}

/** A word with per-word timing produced by the CTC aligner. */
export interface AlignedWord {
  text: string;
  start: number;
  end: number;
  conf: number;
}

/** A contiguous region of speech, as found by the VAD. */
export interface SpeechRegion {
  start: number;
  end: number;
}

export type Stage =
  | 'decode'
  | 'vad'
  | 'asr'
  | 'align'
  | 'stitch'
  | 'cues'
  | 'done';

export type ErrorCode =
  | 'engine-load-failed'
  | 'decode-failed'
  | 'no-audio-track'
  /** An audio track exists but holds no speech — silence, or noise only. */
  | 'no-speech'
  | 'model-download-failed'
  | 'quota-exceeded'
  | 'out-of-memory'
  | 'unsupported-browser'
  | 'cancelled'
  | 'unknown';

/**
 * Broadcast-standard readability defaults, from the brief's section 2.4.
 * Configurable by design — cue building takes these as a parameter rather than
 * reading the constant, so the editor can expose them later without a rewrite.
 */
export interface ReadabilityRules {
  /** Max characters per line. ~16 is the CJK equivalent. */
  maxCharsPerLine: number;
  maxLinesPerCue: number;
  /** Seconds. */
  minCueDuration: number;
  /** Seconds. */
  maxCueDuration: number;
  /** Characters per second, the comfortable default. */
  targetCps: number;
  /** Characters per second, the hard ceiling flagged by QC. */
  maxCps: number;
  /** Seconds. Two frames at 24fps ≈ 0.083 s. */
  minGap: number;
}

export const DEFAULT_READABILITY: ReadabilityRules = {
  maxCharsPerLine: 42,
  maxLinesPerCue: 2,
  minCueDuration: 0.833,
  maxCueDuration: 7,
  targetCps: 17,
  maxCps: 20,
  minGap: 0.083,
};

/** CJK text is far denser per character, so the line budget shrinks. */
export const CJK_READABILITY: ReadabilityRules = {
  ...DEFAULT_READABILITY,
  maxCharsPerLine: 16,
};
