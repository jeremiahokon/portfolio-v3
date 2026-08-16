import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearJobInFlight,
  markJobInFlight,
  peekInterruptedJob,
} from './persist';

/**
 * The in-flight marker is how a memory kill stops being silent.
 *
 * When the browser runs out of memory it takes the tab with it and reloads, so
 * the page returns to step one having explained nothing. These cover the two
 * ways that mechanism can fail quietly: losing the marker to a repeated read,
 * and letting storage errors escape into the job.
 */

function fakeStorage() {
  const map = new Map<string, string>();

  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

beforeEach(() => {
  vi.stubGlobal('sessionStorage', fakeStorage());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('in-flight job marker', () => {
  it('reports nothing when no job was running', () => {
    expect(peekInterruptedJob()).toBeNull();
  });

  it('survives being read twice', () => {
    // React StrictMode runs mount effects twice in development. A destructive
    // read consumed the marker on the first pass and rendered nothing on the
    // second — silently reintroducing the exact silence this exists to remove.
    markJobInFlight({ fileName: 'zoom-call.mp4', duration: 2340 });

    expect(peekInterruptedJob()).toEqual({
      fileName: 'zoom-call.mp4',
      duration: 2340,
    });
    expect(peekInterruptedJob()).toEqual({
      fileName: 'zoom-call.mp4',
      duration: 2340,
    });
  });

  it('is gone once the job is cleared', () => {
    markJobInFlight({ fileName: 'a.mp4', duration: 10 });
    clearJobInFlight();

    expect(peekInterruptedJob()).toBeNull();
  });

  it('ignores a marker that is not the shape we wrote', () => {
    sessionStorage.setItem('subtitles-job-in-flight', '{ not json');
    expect(peekInterruptedJob()).toBeNull();

    sessionStorage.setItem('subtitles-job-in-flight', '{"duration":10}');
    expect(peekInterruptedJob()).toBeNull();
  });

  it('defaults a missing duration rather than dropping the notice', () => {
    sessionStorage.setItem(
      'subtitles-job-in-flight',
      JSON.stringify({ fileName: 'a.mp4' })
    );

    expect(peekInterruptedJob()).toEqual({ fileName: 'a.mp4', duration: 0 });
  });

  it('never throws when storage is unavailable', () => {
    // Safari private mode throws on setItem rather than failing quietly, and a
    // diagnostic aid must not be the thing that breaks the tool.
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    });

    expect(() =>
      markJobInFlight({ fileName: 'a.mp4', duration: 1 })
    ).not.toThrow();
    expect(() => clearJobInFlight()).not.toThrow();
    expect(peekInterruptedJob()).toBeNull();
  });
});
