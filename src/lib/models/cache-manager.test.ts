import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type CachedModel, readCache } from './cache-manager';
import { ALIGNER, ASR, VAD } from './config';

/**
 * The regression these cover: the model manager reported "incomplete" on a
 * healthy Silero cache, permanently.
 *
 * `complete` was `files >= 3` for every model, on the premise that a model is
 * "weights plus a tokenizer and configs". Silero's entire repository is one
 * `onnx/model.onnx` — no config, no tokenizer — so the VAD could never reach
 * three files and was always shown as broken while working perfectly.
 */

function url(id: string, revision: string, file: string): string {
  return `https://huggingface.co/${id}/resolve/${revision}/${file}`;
}

/** A Cache API stand-in holding just the URLs a test cares about. */
function fakeCache(urls: string[]) {
  const keys = urls.map((u) => new Request(u));

  return {
    keys: () => Promise.resolve(keys),
    match: (request: Request) =>
      Promise.resolve(
        keys.includes(request)
          ? new Response('', { headers: { 'content-length': '1000' } })
          : undefined
      ),
  };
}

function install(urls: string[]): void {
  vi.stubGlobal('caches', { open: () => Promise.resolve(fakeCache(urls)) });
  vi.stubGlobal('navigator', {
    storage: { estimate: () => Promise.resolve({}) },
  });
}

const vadComplete = [url(VAD.id, VAD.revision, 'onnx/model.onnx')];

const asrComplete = [
  url(ASR.id, ASR.revision, 'config.json'),
  url(ASR.id, ASR.revision, 'tokenizer.json'),
  url(ASR.id, ASR.revision, 'onnx/encoder_model_int8.onnx'),
  url(ASR.id, ASR.revision, 'onnx/decoder_model_merged_int8.onnx'),
];

const byId = (models: CachedModel[], id: string): CachedModel | undefined =>
  models.find((model) => model.id === id);

beforeEach(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readCache', () => {
  it('calls a one-file Silero cache complete', async () => {
    install(vadComplete);

    const report = await readCache();

    expect(byId(report.models, VAD.id)?.complete).toBe(true);
  });

  it('calls an empty Silero cache incomplete', async () => {
    install(asrComplete);

    const report = await readCache();

    expect(byId(report.models, VAD.id)?.complete).toBe(false);
  });

  it('needs both Whisper weight files, not just a pile of JSON', async () => {
    // Four cached entries would have passed the old `>= 3` test with the
    // decoder missing entirely — a cache that fails on next use, reported as
    // healthy.
    install([
      url(ASR.id, ASR.revision, 'config.json'),
      url(ASR.id, ASR.revision, 'tokenizer.json'),
      url(ASR.id, ASR.revision, 'tokenizer_config.json'),
      url(ASR.id, ASR.revision, 'onnx/encoder_model_int8.onnx'),
    ]);

    const report = await readCache();

    expect(byId(report.models, ASR.id)?.complete).toBe(false);
  });

  it('accepts a complete Whisper cache', async () => {
    install(asrComplete);

    expect(byId((await readCache()).models, ASR.id)?.complete).toBe(true);
  });

  it('ignores weights cached at a superseded revision', async () => {
    install([url(VAD.id, 'some-older-sha', 'onnx/model.onnx')]);

    const report = await readCache();

    expect(byId(report.models, VAD.id)?.complete).toBe(false);
    expect(byId(report.models, VAD.id)?.files).toBe(0);
  });

  it('reports every tracked model even when nothing is cached', async () => {
    install([]);

    const report = await readCache();

    expect(report.models.map((model) => model.id)).toEqual([
      ASR.id,
      ALIGNER.id,
      VAD.id,
    ]);
    expect(report.totalBytes).toBe(0);
  });
});
