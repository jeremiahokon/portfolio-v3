'use client';

import dynamic from 'next/dynamic';

import { Loader2 } from 'lucide-react';

// ffmpeg.wasm touches Worker/window, so it must never render on the server.
const AudioExtractor = dynamic(() => import('./audio-extractor'), {
  ssr: false,
  loading: () => (
    <div className="mx-auto flex w-full max-w-2xl items-center justify-center rounded-3xl border border-[#2C3333]/10 bg-white/60 p-12 shadow-xl backdrop-blur-sm">
      <Loader2 className="h-6 w-6 animate-spin text-[#5BA4D1]" />
    </div>
  ),
});

export default function AudioExtractorLoader() {
  return <AudioExtractor />;
}
