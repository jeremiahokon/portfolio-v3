'use client';

import { useCallback, useEffect, useState } from 'react';

import { HardDrive, Loader2, Trash2 } from 'lucide-react';

import { Tooltip } from '@/components/ui/tooltip';

import {
  type CacheReport,
  purgeAll,
  readCache,
} from '@/lib/models/cache-manager';
import { clearAllCheckpoints } from '@/lib/subtitles/checkpoint';
import { formatBytes } from '@/lib/utils';

/**
 * What this tool has stored on your device, and a button to remove it.
 *
 * The page promises that everything runs locally and nothing is uploaded. The
 * corollary nobody usually implements is that up to ~340 MB of model weights then
 * live on the user's disk, and they should be able to see that and clear it. Storing
 * a third of a gigabyte silently, with no way to reclaim it, would undercut the
 * privacy claim the tool leads with.
 *
 * Collapsed by default and only rendered once something is actually cached: on a
 * first visit there is nothing to manage, and a "0 B cached" row is noise on the page
 * where the user is trying to do the actual job.
 */
export function ModelManager() {
  const [report, setReport] = useState<CacheReport | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setReport(await readCache());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const clear = async () => {
    setBusy(true);
    // Checkpoints go with the weights: someone reclaiming space wants all of it, and
    // a resume offer pointing at a model that is no longer cached is a trap.
    await Promise.all([purgeAll(), clearAllCheckpoints()]);
    await refresh();
    setBusy(false);
  };

  const cached = report?.models.filter((model) => model.bytes > 0) ?? [];
  if (!report || cached.length === 0) return null;

  return (
    <div className="border-ink/10 mt-4 rounded-sm border bg-white/40 px-4 py-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="font-family-inter text-ink/60 hover:text-ink flex w-full items-center gap-2 text-xs whitespace-nowrap"
      >
        <HardDrive className="h-3.5 w-3.5" />
        <span>
          {formatBytes(report.totalBytes)} of models stored on this device
        </span>
        <span className="text-ink/35 ml-auto">{open ? 'Hide' : 'Manage'}</span>
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-2 border-t border-black/5 pt-3">
          {cached.map((model) => (
            <div
              key={model.id}
              className="font-family-inter flex items-center gap-2 text-[11px]"
            >
              <span className="text-ink/70">{model.label}</span>
              {!model.complete && (
                <Tooltip label="Fewer files than this model needs are cached, which usually means a download was interrupted. It will be re-fetched on next use.">
                  <span className="cursor-help rounded-sm bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">
                    incomplete
                  </span>
                </Tooltip>
              )}
              <span className="text-ink/40 ml-auto tabular-nums">
                {formatBytes(model.bytes)}
              </span>
            </div>
          ))}

          {report.quotaBytes !== null && (
            <p className="font-family-inter text-ink/35 mt-1 text-[11px]">
              Your browser allows this site up to{' '}
              {formatBytes(report.quotaBytes)}.
            </p>
          )}

          <Tooltip label="Deletes the cached models and any half-finished job. Nothing else is affected — your transcripts were never stored anywhere but this browser. The models re-download next time you use the tool.">
            <button
              type="button"
              onClick={() => void clear()}
              disabled={busy}
              className="font-family-inter mt-1 inline-flex w-fit items-center gap-1.5 rounded-sm border border-red-200 px-3 py-1.5 text-[11px] whitespace-nowrap text-red-700 hover:bg-red-50 disabled:text-red-300"
            >
              {busy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
              {busy ? 'Clearing…' : 'Clear stored models'}
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
