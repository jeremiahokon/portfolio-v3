'use client';

import dynamic from 'next/dynamic';

import { Loader2 } from 'lucide-react';

// ffmpeg.wasm and the model worker both touch Worker/window, so this must never
// render on the server. The skeleton mirrors the idle dropzone's footprint
// (card shell + min-height) so hydration doesn't shift the layout.
const Subtitler = dynamic(
  () => import('./subtitler').then((module_) => module_.Subtitler),
  {
    ssr: false,
    loading: () => (
      <div className="mx-auto w-full max-w-2xl">
        <div className="border-ink/10 flex min-h-[380px] items-center justify-center rounded-sm border bg-white/60 p-3 shadow-xl backdrop-blur-sm md:min-h-[460px] md:p-4">
          <Loader2 className="text-sky-text h-6 w-6 animate-spin" />
        </div>
      </div>
    ),
  }
);

export default function SubtitlerLoader() {
  return <Subtitler />;
}
