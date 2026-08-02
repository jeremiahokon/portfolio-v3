'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { type FFFSType, FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { AudioLines, FileVideo, RotateCcw } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';

import { Button } from '@/ui/button';
import { Progress } from '@/ui/progress';

import { useReducedMotion } from '@/lib/hooks';
import { cn } from '@/lib/utils';

import { EqualizerBars, SuccessCheck, UploadCloudAnim } from './animated-icons';

// The input is streamed into ffmpeg via a WORKERFS mount (read by reference,
// never copied into WASM memory), and `-vn` means the video stream is never
// decoded — only the audio is. So neither the WASM heap (2 GB ceiling, holds
// just the small MP3 output + working buffers) nor CPU is the binding limit;
// verified locally: a 961 MB clip extracted in ~7 s with ~40 MB peak JS heap.
// The real constraint is client hardware — mobile browsers kill tabs that hold
// very large files while running WASM. 1 GB is the mobile-safe sweet spot that
// still covers essentially any realistic "extract audio from a video" input.
const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1 GB
const ACCEPTED_EXTENSIONS = ['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v'];

type Status = 'idle' | 'loading-engine' | 'processing' | 'done';

function isVideoFile(file: File): boolean {
  if (file.type.startsWith('video/')) return true;
  const name = file.name.toLowerCase();

  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function baseName(name: string): string {
  const dot = name.lastIndexOf('.');

  return dot === -1 ? name : name.slice(0, dot);
}

export default function AudioExtractor() {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; name: string } | null>(
    null
  );

  const reduced = useReducedMotion();

  const ffmpegRef = useRef<FFmpeg | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      console.warn('[ffmpeg]', message);
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

  const handleFile = useCallback(
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

      try {
        if (!ffmpegRef.current) {
          setStatus('loading-engine');
        }
        const ffmpeg = await loadEngine();

        setStatus('processing');

        // Mount the source File by reference (WORKERFS reads it lazily from
        // disk) instead of copying every byte into WASM memory with writeFile.
        // This lets multi-gigabyte videos through — only the small MP3 output
        // and ffmpeg's working buffers live in linear memory.
        const dir = '/mount';
        const inputPath = `${dir}/${file.name}`;
        const outputName = `${baseName(file.name)}.mp3`;

        await ffmpeg.createDir(dir).catch(() => undefined);
        // `FFFSType.WORKERFS` is a string enum ("WORKERFS"); pass the literal so
        // we don't depend on the enum being re-exported as a runtime value.
        await ffmpeg.mount('WORKERFS' as FFFSType, { files: [file] }, dir);

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

        await ffmpeg.deleteFile(outputName).catch(() => undefined);
        await ffmpeg.unmount(dir).catch(() => undefined);
        await ffmpeg.deleteDir(dir).catch(() => undefined);

        setResult({ url, name: outputName });
        setProgress(100);
        setStatus('done');
      } catch (err) {
        // Surface the real cause — the friendly copy below hides it, and this
        // path swallowed a cross-origin-isolation failure once already.
        console.error('[audio-extractor] extraction failed', err);
        setError(
          'Extraction failed — the file may be too large or in an unsupported format.'
        );
        setStatus('idle');
      }
    },
    [loadEngine]
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const reset = () => {
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
    setResult(null);
    setFileName(null);
    setProgress(0);
    setError(null);
    setStatus('idle');
  };

  const stateTransition = reduced
    ? { duration: 0 }
    : { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/70 p-3 shadow-[0_20px_60px_-20px_rgba(44,51,51,0.25)] backdrop-blur-md md:p-4">
        <AnimatePresence mode="wait">
          {/* ── Result ─────────────────────────────────────────────── */}
          {status === 'done' && result ? (
            <m.div
              key="done"
              initial={reduced ? undefined : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, y: -12 }}
              transition={stateTransition}
              className="flex flex-col items-center gap-6 rounded-2xl bg-gradient-to-b from-emerald-500/[0.06] to-transparent p-8 text-center md:p-12"
            >
              <div className="h-20 w-20">
                <SuccessCheck />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-footer-background text-xl font-bold md:text-2xl">
                  Your MP3 is ready
                </p>
                <p className="font-family-inter flex items-center justify-center gap-2 text-sm text-[#2C3333]/60">
                  <AudioLines className="h-4 w-4 text-[#5BA4D1]" />
                  {result.name}
                </p>
              </div>

              <audio controls src={result.url} className="w-full max-w-sm">
                <track kind="captions" />
              </audio>

              <div className="flex flex-col items-center gap-3 sm:flex-row">
                <a
                  href={result.url}
                  download={result.name}
                  className="group inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#7BB6DD] to-[#5BA4D1] px-8 py-3.5 text-sm font-bold tracking-wide text-white uppercase shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_40px_rgba(123,182,221,0.45)]"
                >
                  Download MP3
                </a>
                <Button
                  variant="ghost"
                  onClick={reset}
                  className="rounded-full text-[#2C3333]/70 hover:bg-[#2C3333]/[0.05] hover:text-[#2C3333]"
                >
                  <RotateCcw className="h-4 w-4" />
                  Extract another
                </Button>
              </div>
            </m.div>
          ) : busy ? (
            /* ── Loading engine / processing ──────────────────────── */
            <m.div
              key="busy"
              initial={reduced ? undefined : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, y: -12 }}
              transition={stateTransition}
              className="flex flex-col items-center gap-6 rounded-2xl bg-[#7BB6DD]/[0.04] p-8 text-center md:p-14"
            >
              <div className="h-20 w-20">
                <EqualizerBars />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-footer-background text-lg font-bold md:text-xl">
                  {status === 'loading-engine'
                    ? 'Warming up the audio engine…'
                    : 'Extracting your audio…'}
                </p>
                <p className="font-family-inter text-sm text-[#2C3333]/55">
                  {status === 'loading-engine'
                    ? 'One-time ~30 MB download — runs fully in your browser.'
                    : (fileName ??
                      'Working locally, nothing leaves your device.')}
                </p>
              </div>
              {status === 'processing' && (
                <div className="w-full max-w-sm">
                  <Progress value={progress} />
                  <div className="mt-2 flex items-center justify-between">
                    <span className="font-family-inter text-xs text-[#2C3333]/45">
                      Encoding MP3
                    </span>
                    <span className="font-family-inter text-sm font-bold text-[#5BA4D1] tabular-nums">
                      {progress}%
                    </span>
                  </div>
                </div>
              )}
            </m.div>
          ) : (
            /* ── Idle dropzone ────────────────────────────────────── */
            <m.div
              key="idle"
              initial={reduced ? undefined : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, y: -12 }}
              transition={stateTransition}
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  inputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDragging(false);
              }}
              onDrop={onDrop}
              className={cn(
                'group relative flex cursor-pointer flex-col items-center justify-center gap-5 overflow-hidden rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-300 outline-none md:p-14',
                isDragging
                  ? 'scale-[1.01] border-[#5BA4D1] bg-[#7BB6DD]/10'
                  : 'border-[#2C3333]/15 bg-[#2C3333]/[0.02] hover:border-[#7BB6DD]/50 hover:bg-[#7BB6DD]/[0.04] focus-visible:border-[#7BB6DD]/60'
              )}
            >
              {/* Drag-over ripple */}
              <AnimatePresence>
                {isDragging && !reduced && (
                  <m.span
                    key="ripple"
                    className="pointer-events-none absolute inset-0 rounded-2xl bg-[#7BB6DD]/10"
                    initial={{ opacity: 0.5, scale: 0.9 }}
                    animate={{ opacity: 0, scale: 1.05 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                  />
                )}
              </AnimatePresence>

              {/* Icon with soft pulsing glow */}
              <div className="relative flex h-20 w-20 items-center justify-center">
                {!reduced && (
                  <m.span
                    className="absolute inset-0 rounded-2xl bg-[#7BB6DD]/20 blur-xl"
                    animate={{
                      opacity: [0.4, 0.8, 0.4],
                      scale: [0.9, 1.05, 0.9],
                    }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                  />
                )}
                <div className="relative flex h-16 w-16 items-center justify-center">
                  <UploadCloudAnim />
                </div>
              </div>

              <div className="relative flex flex-col gap-1">
                <p className="text-footer-background text-lg font-bold md:text-xl">
                  {isDragging ? 'Release to extract' : 'Drop your video here'}
                </p>
                <p className="font-family-inter text-sm text-[#2C3333]/60">
                  or click to browse
                </p>
              </div>

              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  inputRef.current?.click();
                }}
                className="relative rounded-full bg-gradient-to-r from-[#7BB6DD] to-[#5BA4D1] px-6 text-white hover:from-[#5BA4D1] hover:to-[#7BB6DD]"
              >
                <FileVideo className="h-4 w-4" />
                Choose a video
              </Button>

              <p className="font-family-inter relative text-xs text-[#2C3333]/40">
                MP4 · MOV · MKV · AVI · WEBM · M4V — up to 1 GB
              </p>

              <input
                ref={inputRef}
                type="file"
                accept={`video/*,${ACCEPTED_EXTENSIONS.join(',')}`}
                onChange={onInputChange}
                className="hidden"
              />
            </m.div>
          )}
        </AnimatePresence>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <m.p
            initial={reduced ? undefined : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0 }}
            className="font-family-inter mt-4 flex items-center justify-center gap-2 rounded-full border border-red-500/20 bg-red-500/[0.06] px-4 py-2.5 text-center text-sm text-red-600"
          >
            {error}
          </m.p>
        )}
      </AnimatePresence>

      <p className="font-family-inter mt-5 text-center text-xs text-[#2C3333]/45">
        Everything runs locally in your browser using WebAssembly. Your video is
        never uploaded to a server.
      </p>
    </div>
  );
}
