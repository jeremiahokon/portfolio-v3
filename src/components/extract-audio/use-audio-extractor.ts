'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { type FFFSType, FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

import { baseName, formatBytes } from '@/lib/utils';

// The input is streamed into ffmpeg via a WORKERFS mount (read by reference,
// never copied into WASM memory), and `-vn` means the video stream is never
// decoded — only the audio is. So neither the WASM heap (2 GB ceiling, holds
// just the small MP3 output + working buffers) nor CPU is the binding limit;
// verified locally: a 961 MB clip extracted in ~7 s with ~40 MB peak JS heap.
// The real constraint is client hardware — mobile browsers kill tabs that hold
// very large files while running WASM. 1 GB is the mobile-safe sweet spot that
// still covers essentially any realistic "extract audio from a video" input.
export const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1 GB
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

  const ffmpegRef = useRef<FFmpeg | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  // Tail of engine output, kept so failures can be classified (e.g. "no audio
  // stream") without logging anything in production.
  const logTailRef = useRef<string[]>([]);

  const busy = status === 'loading-engine' || status === 'processing';

  useEffect(
    () => () => {
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    },
    []
  );

  const loadEngine = useCallback(async () => {
    if (ffmpegRef.current) return ffmpegRef.current;

    const ffmpeg = new FFmpeg();
    ffmpeg.on('progress', ({ progress: ratio }) => {
      setProgress(Math.min(100, Math.max(0, Math.round(ratio * 100))));
    });
    ffmpeg.on('log', ({ message }) => {
      logTailRef.current.push(message);
      if (logTailRef.current.length > 50) logTailRef.current.shift();
      if (process.env.NODE_ENV === 'development') {
        console.warn('[ffmpeg]', message);
      }
    });

    // Single-threaded core: no SharedArrayBuffer, so the page needs no
    // cross-origin isolation (COOP/COEP) headers. That deliberately avoids the
    // multi-threaded core's module-worker chunk, which Vercel's edge blocks with
    // ERR_BLOCKED_BY_RESPONSE in a require-corp context — the extractor hung on
    // "Warming up the audio engine" in production as a result. There is no
    // ffmpeg-core.worker.js in the single-threaded build, so no workerURL.
    const baseURL = '/ffmpeg';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(
        `${baseURL}/ffmpeg-core.wasm`,
        'application/wasm'
      ),
    });

    ffmpegRef.current = ffmpeg;

    return ffmpeg;
  }, []);

  const extract = useCallback(
    async (file: File) => {
      setError(null);

      if (!isVideoFile(file)) {
        setError(
          'That doesn’t look like a video file. Try MP4, MOV, MKV, AVI, WEBM, or M4V.'
        );

        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(
          `File is too large (${formatBytes(file.size)}). The limit is 1 GB — try a shorter clip.`
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

      // Load the engine in its own try so a network/CDN failure fetching the
      // ~30 MB core isn't misreported as a broken video file.
      let ffmpeg: FFmpeg;
      try {
        if (!ffmpegRef.current) setStatus('loading-engine');
        ffmpeg = await loadEngine();
      } catch (err) {
        console.error('[audio-extractor] engine failed to load', err);
        setError(
          'Couldn’t load the audio engine — check your connection and try again.'
        );
        setStatus('idle');

        return;
      }

      setStatus('processing');

      // Mount the source File by reference (WORKERFS reads it lazily from
      // disk) instead of copying every byte into WASM memory with writeFile.
      // This lets multi-gigabyte videos through — only the small MP3 output
      // and ffmpeg's working buffers live in linear memory.
      const dir = '/mount';
      const inputPath = `${dir}/${file.name}`;
      const outputName = `${baseName(file.name)}.mp3`;
      logTailRef.current = [];
      let mounted = false;

      try {
        await ffmpeg.createDir(dir).catch(() => undefined);
        // `FFFSType.WORKERFS` is a string enum ("WORKERFS"); pass the literal so
        // we don't depend on the enum being re-exported as a runtime value.
        await ffmpeg.mount('WORKERFS' as FFFSType, { files: [file] }, dir);
        mounted = true;

        await ffmpeg.exec([
          '-i',
          inputPath,
          '-vn',
          '-c:a',
          'libmp3lame',
          '-q:a',
          '2',
          outputName,
        ]);

        const data = await ffmpeg.readFile(outputName);
        // Copy into a fresh Uint8Array so the Blob owns its bytes independently
        // of ffmpeg's WASM heap (which is freed/reused after this call).
        const bytes = new Uint8Array(data as Uint8Array);
        const blob = new Blob([bytes], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        resultUrlRef.current = url;

        setResult({ url, name: outputName });
        setProgress(100);
        setStatus('done');
      } catch (err) {
        // Surface the real cause — the friendly copy below hides it, and this
        // path swallowed a cross-origin-isolation failure once already.
        console.error('[audio-extractor] extraction failed', err);
        const tail = logTailRef.current.join('\n');
        setError(
          tail.includes('does not contain any stream') ||
            tail.includes('Output file is empty')
            ? 'This video doesn’t seem to have an audio track.'
            : 'Extraction failed — the file may be corrupted or in an unsupported format.'
        );
        setStatus('idle');
      } finally {
        // Always clean up, even when exec throws — a dirty /mount would make
        // the next attempt's mount fail.
        await ffmpeg.deleteFile(outputName).catch(() => undefined);
        if (mounted) await ffmpeg.unmount(dir).catch(() => undefined);
        await ffmpeg.deleteDir(dir).catch(() => undefined);
      }
    },
    [loadEngine]
  );

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
