import type { FFFSType } from '@ffmpeg/ffmpeg';

import { getEngine } from '@/lib/ffmpeg/engine';

/**
 * Decodes any audio or video file to the mono 16 kHz PCM that both Whisper and
 * the wav2vec2 aligner expect.
 *
 * Runs FFmpeg on the main thread, exactly as the audio extractor does. The WASM
 * itself already executes in the worker `@ffmpeg/ffmpeg` spawns, so the heavy
 * work is off the main thread either way; wrapping it in *our* worker as well
 * would nest a worker inside a worker and depend on the library's
 * `new Worker(new URL(...))` resolving from inside a Turbopack-bundled worker
 * chunk, which is unverified. Revisit only if decode measurably janks the UI.
 */

/** Both models are trained at 16 kHz. This is not a tunable. */
export const TARGET_SAMPLE_RATE = 16_000;

export interface DecodedAudio {
  /** Mono samples in [-1, 1], the form transformers.js expects. */
  samples: Float32Array;
  sampleRate: number;
  /** Seconds. Derived from the sample count, so it is exact. */
  duration: number;
}

export class NoAudioTrackError extends Error {
  constructor() {
    super('This file doesn’t seem to have an audio track.');
    this.name = 'NoAudioTrackError';
  }
}

export class DecodeFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecodeFailedError';
  }
}

/**
 * Converts interleaved little-endian signed 16-bit PCM to normalised floats.
 *
 * Divides by 32768 rather than 32767 so the mapping is exact for the negative
 * extreme and no value can exceed 1.0 — the asymmetry of two's complement means
 * the other choice would clip -32768 to slightly beyond -1.
 */
export function int16ToFloat32(bytes: Uint8Array): Float32Array {
  // A truncated final byte would otherwise be read as a bogus sample.
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2);
  const out = new Float32Array(sampleCount);

  for (let i = 0; i < sampleCount; i += 1) {
    out[i] = view.getInt16(i * 2, true) / 32_768;
  }

  return out;
}

/**
 * Decodes `file` to mono 16 kHz float samples.
 *
 * `onProgress` receives 0..1 from FFmpeg's own progress events, which callers
 * subscribe to via `subscribeEngine` — this function does not attach handlers,
 * so it does not fight the extractor over the shared engine's listeners.
 */
export async function decodeToPcm(
  file: File,
  signal?: AbortSignal
): Promise<DecodedAudio> {
  signal?.throwIfAborted();

  const ffmpeg = await getEngine(signal);

  // Mount the source by reference so multi-gigabyte inputs never enter WASM
  // memory; only the decoded PCM does.
  const dir = '/pcm-mount';
  const inputPath = `${dir}/${file.name}`;
  const outputName = 'audio.raw';
  let mounted = false;

  try {
    await ffmpeg.createDir(dir).catch(() => undefined);
    // `FFFSType.WORKERFS` is a string enum ("WORKERFS"); pass the literal so we
    // don't depend on the enum being re-exported as a runtime value.
    await ffmpeg.mount('WORKERFS' as FFFSType, { files: [file] }, dir);
    mounted = true;

    signal?.throwIfAborted();

    // `-vn` drops video without decoding it. `-f s16le` forces raw output with
    // no container, so what comes back is exactly sampleCount * 2 bytes.
    //
    // The signal goes in the third argument; the second is a timeout, left at
    // the library's unbounded default because a legitimate hour-long decode
    // must not be killed by an arbitrary deadline. Cancellation is the user's
    // to trigger, which is what the signal is for.
    await ffmpeg.exec(
      [
        '-i',
        inputPath,
        '-vn',
        '-ac',
        '1',
        '-ar',
        String(TARGET_SAMPLE_RATE),
        '-acodec',
        'pcm_s16le',
        '-f',
        's16le',
        outputName,
      ],
      -1,
      signal ? { signal } : {}
    );

    signal?.throwIfAborted();

    // `exec` resolves with a non-zero code rather than throwing, so a failed
    // decode surfaces here as a missing or empty output file.
    let data: Uint8Array;
    try {
      data = (await ffmpeg.readFile(outputName)) as Uint8Array;
    } catch {
      throw new NoAudioTrackError();
    }
    if (data.byteLength === 0) throw new NoAudioTrackError();

    const samples = int16ToFloat32(data);

    return {
      samples,
      sampleRate: TARGET_SAMPLE_RATE,
      duration: samples.length / TARGET_SAMPLE_RATE,
    };
  } finally {
    // Always clean up: a dirty mount point makes the next run's mount fail.
    await ffmpeg.deleteFile(outputName).catch(() => undefined);
    if (mounted) await ffmpeg.unmount(dir).catch(() => undefined);
    await ffmpeg.deleteDir(dir).catch(() => undefined);
  }
}
