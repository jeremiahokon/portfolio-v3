/**
 * Can this device finish the job at all?
 *
 * R4 in the risk register: a phone runs out of memory partway through and the tab
 * dies. That failure is uniquely bad because of *when* it happens — after a 151 MB
 * download and several minutes of work, with nothing to show and no explanation. The
 * user concludes the tool is broken, which is the correct conclusion from what they
 * saw.
 *
 * So the check runs **before** the download, and it refuses clearly rather than
 * letting the device try and die. Refusing to start is a far better experience than
 * an unexplained crash, and it costs the user nothing but a sentence.
 *
 * **What this deliberately is not.** It does not sniff user agents, which get the
 * answer wrong in both directions — a recent iPad outperforms plenty of laptops, and
 * a cheap Android tablet reports the same platform string as a flagship. It reads
 * the capability signals the platform actually exposes, and where the answer is
 * genuinely unknown it lets the job proceed with a warning instead of blocking.
 * Guessing "no" on a device that would have worked is its own kind of failure.
 */

export type Verdict = 'ready' | 'warn' | 'refuse';

export interface Capability {
  verdict: Verdict;
  /** Shown to the user. Empty when `ready`. */
  message: string;
  /** Populated for diagnostics, not for display. */
  signals: {
    memoryGb: number | null;
    cores: number | null;
    webgpu: boolean;
    storageQuotaGb: number | null;
    coarsePointer: boolean;
  };
}

export interface CapabilityInput {
  /** `navigator.deviceMemory`-style hint in GB, or null when unreported. */
  memoryGb: number | null;
  cores: number | null;
  webgpu: boolean;
  /** Storage the origin may use, in GB, or null when unreported. */
  storageQuotaGb: number | null;
  /** True on touch-primary devices — a proxy for phone, not a decision on its own. */
  coarsePointer: boolean;
  /** Seconds of audio the user is asking for, when known. */
  durationSeconds?: number;
}

/**
 * Roughly what stage one needs on disk: the weights plus room for the cache to be
 * written before the old copy is released.
 */
export const REQUIRED_STORAGE_GB = 0.5;

/**
 * Below this, a WASM heap large enough for Whisper plus the decoded PCM is not
 * plausible. Devices reporting 1 GB or less are where the OOM reports come from.
 */
export const MIN_MEMORY_GB = 2;

/**
 * Minutes of audio beyond which a memory-constrained device is asking for trouble.
 *
 * Decoded PCM is held in memory at roughly 3.8 MB per minute, so 30 minutes is about
 * 115 MB before the model is loaded at all — survivable on a desktop, as the
 * 39-minute run proved, and not on a phone.
 */
export const LONG_JOB_MINUTES = 15;

export function assess(input: CapabilityInput): Capability {
  const signals = {
    memoryGb: input.memoryGb,
    cores: input.cores,
    webgpu: input.webgpu,
    storageQuotaGb: input.storageQuotaGb,
    coarsePointer: input.coarsePointer,
  };

  // Storage is the one hard refusal that does not depend on a heuristic: without
  // room for the weights the download cannot complete, full stop.
  if (
    input.storageQuotaGb !== null &&
    input.storageQuotaGb < REQUIRED_STORAGE_GB
  ) {
    return {
      verdict: 'refuse',
      message:
        'There isn’t enough free storage in this browser for the speech model. Free up some space, or try on a desktop browser.',
      signals,
    };
  }

  if (input.memoryGb !== null && input.memoryGb < MIN_MEMORY_GB) {
    return {
      verdict: 'refuse',
      message:
        'This device reports too little memory to run the speech model without crashing. Please try on a desktop browser.',
      signals,
    };
  }

  const minutes = (input.durationSeconds ?? 0) / 60;
  const constrained =
    input.coarsePointer || (input.memoryGb !== null && input.memoryGb <= 4);

  if (constrained && minutes > LONG_JOB_MINUTES) {
    return {
      verdict: 'warn',
      message: `This is a ${Math.round(minutes)}-minute file and phones usually run out of memory well before the end. It will be far more reliable on a desktop browser.`,
      signals,
    };
  }

  // WebGPU absent means the WASM path, which is correct but much slower — and since
  // isolation is off it cannot even use threads. Worth saying before a long wait,
  // not worth refusing over.
  if (!input.webgpu) {
    return {
      verdict: 'warn',
      message:
        'This browser has no GPU acceleration available, so transcription will run on the slower path. It still works — expect it to take several times longer.',
      signals,
    };
  }

  return { verdict: 'ready', message: '', signals };
}

/** Reads the signals from the browser. Returns nulls for anything unreported. */
export async function probeDevice(
  durationSeconds?: number
): Promise<CapabilityInput> {
  const nav = globalThis.navigator as
    | (Navigator & { deviceMemory?: number })
    | undefined;

  let storageQuotaGb: number | null = null;
  try {
    const estimate = await nav?.storage?.estimate?.();
    if (estimate?.quota !== undefined) {
      storageQuotaGb = estimate.quota / 1024 ** 3;
    }
  } catch {
    // Some browsers reject rather than omit. Unknown, not zero.
  }

  let webgpu = false;
  try {
    const gpu = (globalThis.navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } })
      .gpu;
    webgpu = gpu ? Boolean(await gpu.requestAdapter()) : false;
  } catch {
    webgpu = false;
  }

  return {
    memoryGb: nav?.deviceMemory ?? null,
    cores: nav?.hardwareConcurrency ?? null,
    webgpu,
    storageQuotaGb,
    coarsePointer:
      globalThis.matchMedia?.('(pointer: coarse)').matches ?? false,
    ...(durationSeconds === undefined ? {} : { durationSeconds }),
  };
}
