import { Link as TransitionLink } from 'next-view-transitions';

import { ShieldCheck, Zap } from 'lucide-react';
import type { Metadata } from 'next';

import AudioExtractorLoader from './audio-extractor-loader';

export const metadata: Metadata = {
  title: 'Free Video to MP3 Audio Extractor',
  description:
    'Extract high-quality MP3 audio from any video right in your browser. 100% private, nothing is uploaded, no sign up required.',
  alternates: { canonical: '/extract-audio' },
  openGraph: {
    title: 'Free Video to MP3 Audio Extractor',
    description:
      'Pull crisp MP3 audio from any video, entirely in your browser. Private and free.',
    url: '/extract-audio',
  },
};

export default function ExtractAudioPage() {
  return (
    <>
      {/* Cohesive full-viewport backdrop — sits behind the transparent global
          header too, so header and body share one seamless background. */}
      <div className="bg-background pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-1/4 -left-1/4 h-[600px] w-[600px] rounded-full bg-[#7BB6DD]/20 blur-[120px]" />
        <div className="absolute top-1/3 -right-1/4 h-[500px] w-[500px] rounded-full bg-[#5BA4D1]/15 blur-[100px]" />
        <div className="absolute bottom-0 left-1/3 h-[550px] w-[550px] rounded-full bg-[#a855f7]/10 blur-[110px]" />
      </div>

      <section className="relative flex w-full flex-col items-center px-4 py-20 md:px-10 md:py-28">
        {/* Header */}
        <div className="mb-12 flex flex-col items-center gap-5 text-center">
          <TransitionLink
            href="/tools"
            className="font-family-instrument text-ink/60 hover:text-ink text-lg italic underline-offset-4 transition-colors hover:underline"
          >
            back to all tools
          </TransitionLink>
          <span className="font-family-inter text-xs font-medium tracking-[0.3em] text-[#2C3333]/50 uppercase">
            [ FREE TOOL ]
          </span>
          <h1 className="text-footer-background max-w-3xl text-4xl leading-[1.05] font-bold tracking-tight md:text-6xl lg:text-7xl">
            Pull{' '}
            <span className="font-family-instrument font-normal italic">
              crisp audio
            </span>{' '}
            from any video.
          </h1>
          <p className="font-family-inter max-w-xl text-lg text-[#2C3333]/50 md:text-xl">
            Drop in a clip and get a high-quality MP3 back in seconds. Runs
            entirely in your browser. Nothing is uploaded.
          </p>

          {/* Trust badges */}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <span className="font-family-inter flex items-center gap-2 rounded-full border border-[#2C3333]/10 bg-[#2C3333]/[0.03] px-4 py-2 text-xs font-medium text-[#2C3333]/70">
              <ShieldCheck className="h-4 w-4 text-[#5BA4D1]" />
              100% private
            </span>
            <span className="font-family-inter flex items-center gap-2 rounded-full border border-[#2C3333]/10 bg-[#2C3333]/[0.03] px-4 py-2 text-xs font-medium text-[#2C3333]/70">
              <Zap className="h-4 w-4 text-[#5BA4D1]" />
              No sign up · No watermark
            </span>
          </div>
        </div>

        <AudioExtractorLoader />
      </section>
    </>
  );
}
