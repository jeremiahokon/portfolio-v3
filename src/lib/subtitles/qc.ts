import { cueCps } from './cues';
import { cueBounds, cueText } from './export';
import {
  type Cue,
  DEFAULT_READABILITY,
  type ReadabilityRules,
  type Word,
} from './types';

/**
 * Quality control: what is still wrong with this subtitle track.
 *
 * Pure, and deliberately a *reporter* rather than a fixer. `normalizeCues` repairs
 * what can be repaired without making something else worse; whatever survives is
 * a real trade-off that only a human can settle — usually by cutting words, which
 * is an editorial decision and not ours to make.
 *
 * The counterpart to that: this must not stay silent about anything. A tool that
 * quietly ships a cue nobody can read is worse than one that says so.
 */

export type QcKind =
  | 'reading-speed'
  | 'too-short'
  | 'too-long'
  | 'line-too-long'
  | 'too-many-lines'
  | 'gap-too-small'
  | 'overlap'
  | 'low-confidence'
  | 'empty';

export type QcSeverity = 'error' | 'warning';

export interface QcIssue {
  kind: QcKind;
  severity: QcSeverity;
  cueIndex: number;
  /** Human-readable, already carrying the measured number. */
  message: string;
  /** The measurement that triggered it, for sorting worst-first. */
  value?: number;
}

/**
 * Severity is about whether the output is *broken* or merely *suboptimal*.
 *
 * An overlap or an unrenderable cue is malformed output that a player may reject
 * outright — that is an error. A cue that reads a little fast is legible but
 * uncomfortable, which is a warning. The distinction matters because a wall of
 * undifferentiated red teaches the user to ignore all of it.
 */
const SEVERITY: Record<QcKind, QcSeverity> = {
  overlap: 'error',
  empty: 'error',
  'line-too-long': 'error',
  'too-many-lines': 'error',
  'reading-speed': 'warning',
  'too-short': 'warning',
  'too-long': 'warning',
  'gap-too-small': 'warning',
  'low-confidence': 'warning',
};

function issue(
  kind: QcKind,
  cueIndex: number,
  message: string,
  value?: number
): QcIssue {
  return {
    kind,
    severity: SEVERITY[kind],
    cueIndex,
    message,
    ...(value === undefined ? {} : { value }),
  };
}

export interface QcOptions {
  rules: ReadabilityRules;
  /** Below this word confidence, flag the cue for review. 0 disables. */
  minConfidence: number;
}

export const DEFAULT_QC: QcOptions = {
  rules: DEFAULT_READABILITY,
  // Only meaningful once the aligner has run; estimated words all score 0, and
  // flagging every cue in an un-aligned transcript would be noise, so the check
  // skips words that were never scored at all.
  minConfidence: 0.3,
};

export function checkCues(
  words: Word[],
  cues: Cue[],
  options: QcOptions = DEFAULT_QC
): QcIssue[] {
  const { rules, minConfidence } = options;
  const issues: QcIssue[] = [];

  cues.forEach((cue, index) => {
    const text = cueText(cue, words);
    const { start, end } = cueBounds(cue, words);
    const duration = end - start;
    const lines = text.split('\n');

    if (text.trim().length === 0) {
      issues.push(issue('empty', index, 'This cue has no text.'));

      return;
    }

    if (duration <= 0) {
      issues.push(
        issue('empty', index, 'This cue has no duration and cannot be shown.')
      );
    } else {
      const cps = cueCps(text, start, end);
      if (cps > rules.maxCps) {
        issues.push(
          issue(
            'reading-speed',
            index,
            `Reads at ${cps.toFixed(0)} characters per second — the comfortable ceiling is ${rules.maxCps}.`,
            cps
          )
        );
      }
      if (duration < rules.minCueDuration) {
        issues.push(
          issue(
            'too-short',
            index,
            `On screen for ${duration.toFixed(2)}s — under the ${rules.minCueDuration}s minimum.`,
            duration
          )
        );
      }
      if (duration > rules.maxCueDuration) {
        issues.push(
          issue(
            'too-long',
            index,
            `On screen for ${duration.toFixed(1)}s — over the ${rules.maxCueDuration}s maximum.`,
            duration
          )
        );
      }
    }

    for (const line of lines) {
      if (line.length > rules.maxCharsPerLine) {
        issues.push(
          issue(
            'line-too-long',
            index,
            `A line is ${line.length} characters — the limit is ${rules.maxCharsPerLine}.`,
            line.length
          )
        );
        break;
      }
    }

    if (lines.length > rules.maxLinesPerCue) {
      issues.push(
        issue(
          'too-many-lines',
          index,
          `${lines.length} lines — the limit is ${rules.maxLinesPerCue}.`,
          lines.length
        )
      );
    }

    if (minConfidence > 0) {
      // Only words that were actually scored can be low-confidence. A word left
      // on its estimate has conf 0, which means "unmeasured", not "bad".
      const scored = words
        .slice(cue.wordStart, cue.wordEnd + 1)
        .filter((word) => word.conf > 0);
      const weakest =
        scored.length === 0 ? null : Math.min(...scored.map((w) => w.conf));

      if (weakest !== null && weakest < minConfidence) {
        issues.push(
          issue(
            'low-confidence',
            index,
            `Timing for at least one word is uncertain (${weakest.toFixed(2)}).`,
            weakest
          )
        );
      }
    }

    const next = cues[index + 1];
    if (next) {
      const nextStart = cueBounds(next, words).start;
      const gap = nextStart - end;

      if (gap < 0) {
        issues.push(
          issue(
            'overlap',
            index,
            `Overlaps the next cue by ${Math.abs(gap).toFixed(2)}s.`,
            gap
          )
        );
      } else if (gap < rules.minGap) {
        issues.push(
          issue(
            'gap-too-small',
            index,
            `Only ${(gap * 1000).toFixed(0)}ms before the next cue — ${(rules.minGap * 1000).toFixed(0)}ms is the minimum.`,
            gap
          )
        );
      }
    }
  });

  return issues;
}

export interface QcSummary {
  errors: number;
  warnings: number;
  byKind: Record<string, number>;
  /** True when nothing at all is wrong. */
  clean: boolean;
}

export function summarize(issues: QcIssue[]): QcSummary {
  const byKind: Record<string, number> = {};
  let errors = 0;
  let warnings = 0;

  for (const item of issues) {
    byKind[item.kind] = (byKind[item.kind] ?? 0) + 1;
    if (item.severity === 'error') errors += 1;
    else warnings += 1;
  }

  return { errors, warnings, byKind, clean: issues.length === 0 };
}
