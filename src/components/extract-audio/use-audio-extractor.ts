'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { sendGAEvent } from '@next/third-parties/google';

import type { FFmpeg } from '@ffmpeg/ffmpeg';

import { GA_EVENTS } from '@/lib/analytics-events';
import {
  getEngine,
  isEngineLoaded,
  subscribeEngine,
} from '@/lib/ffmpeg/engine';
import { describeMp3Failure, extractMp3 } from '@/lib/media/extract-mp3';
import { formatBytes } from '@/lib/utils';

// 1 GB: neither the WASM heap nor CPU binds here (verified: a 961 MB clip extracted in ~7s). The real limit is mobile browsers killing tabs that hold large files in memory.
export const MAX_FILE_SIZE = 1024 * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = [
  '.mp4',
  '.mov',
  '.mkv',
  '.avi',
  '.webm',
  '.m4v',
];

export type ExtractorStatus = 'idle' | 'loading-engine' | 'processing' | 'done';

export interface ExtractionResult {
  url: string;
  name: string;
}

function isVideoFile(file: File): boolean {
  if (file.type.startsWith('video/')) return true;
  const name = file.name.toLowerCase();

  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/**
 * Owns the whole extraction lifecycle: engine load, WORKERFS mount, exec,
 * result blob, and cleanup. UI components stay purely presentational.
 */
export function useAudioExtractor() {
  const [status, setStatus] = useState<ExtractorStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractionResult | null>(null);

  const resultUrlRef = useRef<string | null>(null);
  // Tail of engine output, kept so failures can be classified without logging in production.
  const logTailRef = useRef<string[]>([]);

  const busy = status === 'loading-engine' || status === 'processing';

  useEffect(
    () => () => {
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    },
    []
  );

  // Engine is loaded and cached by `@/lib/ffmpeg/engine`, shared with the subtitle pipeline so the core is fetched once per session.
  useEffect(
    () =>
      subscribeEngine({
        onProgress: (ratio) => setProgress(Math.round(ratio * 100)),
        onLog: (message) => {
          logTailRef.current.push(message);
          if (logTailRef.current.length > 50) logTailRef.current.shift();
          if (process.env.NODE_ENV === 'development') {
            console.warn('[ffmpeg]', message);
          }
        },
      }),
    []
  );

  const extract = useCallback(async (file: File) => {
    setError(null);

    if (!isVideoFile(file)) {
      setError(
        'That doesn’t look like a video file. Try MP4, MOV, MKV, AVI, WEBM, or M4V.'
      );

      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError(
        `File is too large (${formatBytes(file.size)}). The limit is 1 GB, try a shorter clip.`
      );

      return;
    }

    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
    setResult(null);
    setFileName(file.name);
    setProgress(0);

    // Own try/catch so a network/CDN failure fetching the engine isn't misreported as a broken video file.
    let ffmpeg: FFmpeg;
    try {
      if (!isEngineLoaded()) setStatus('loading-engine');
      ffmpeg = await getEngine();
    } catch (err) {
      console.error('[audio-extractor] engine failed to load', err);
      setError(
        'Couldn’t load the audio engine, check your connection and try again.'
      );
      setStatus('idle');

      return;
    }

    setStatus('processing');

    logTailRef.current = [];

    try {
      // extractMp3 mounts the file by reference (WORKERFS) rather than copying it into WASM memory, shared with the subtitles tool.
      const { blob, name } = await extractMp3(ffmpeg, file);
      const url = URL.createObjectURL(blob);
      resultUrlRef.current = url;

      setResult({ url, name });
      setProgress(100);
      setStatus('done');
      sendGAEvent({
        event: GA_EVENTS.EXTRACTOR_SUCCESS,
        value: name,
        event_category: 'tool_usage',
      });
    } catch (err) {
      // Logged because the friendly copy below once hid a cross-origin-isolation failure.
      console.error('[audio-extractor] extraction failed', err);
      const friendlyError = describeMp3Failure(logTailRef.current.join('\n'));
      setError(friendlyError);
      setStatus('idle');
      sendGAEvent({
        event: GA_EVENTS.EXTRACTOR_FAILED,
        value: friendlyError,
        error_message: friendlyError,
        event_category: 'tool_usage',
      });
    }
  }, []);

  const reset = useCallback(() => {
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
    setResult(null);
    setFileName(null);
    setProgress(0);
    setError(null);
    setStatus('idle');
  }, []);

  return { status, error, progress, fileName, result, busy, extract, reset };
}
