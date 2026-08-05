import { Link as TransitionLink } from 'next-view-transitions';

import { ShieldCheck, Zap } from 'lucide-react';
import type { Metadata } from 'next';

import { Reveal } from '@/ui/reveal';

import { BookCallCta } from '@/components/book-call-cta';
import { FaqAccordion } from '@/components/extract-audio/faq-accordion';
import { videoToSubtitlesFaqs } from '@/components/video-to-subtitles/faqs';
import SubtitlerLoader from '@/components/video-to-subtitles/subtitler-loader';

import { SITE_URL } from '@/lib/constant';

const TITLE = 'Free Video to Subtitles Generator';
const DESCRIPTION =
  'Turn any video or audio file into timestamped SRT, VTT or JSON subtitles right in your browser. 100% private, nothing is uploaded, no sign up required.';
const SHORT_DESCRIPTION =
  'Generate timestamped subtitles from any video, entirely in your browser. Private and free.';

export const metadata: Metadata = {
  // The root layout's template appends the site suffix.
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/video-to-subtitles' },
  openGraph: {
    title: TITLE,
    description: SHORT_DESCRIPTION,
    url: '/video-to-subtitles',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: SHORT_DESCRIPTION,
  },
};

// A static server component. The whole client payload — ffmpeg.wasm, the model
// worker, transformers.js — sits behind one `next/dynamic` boundary with
// `ssr: false` inside SubtitlerLoader, so no serverless function and no
// server-side transcription is involved.
export default function VideoToSubtitlesPage() {
  const webApplicationSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: TITLE,
    url: `${SITE_URL}/video-to-subtitles`,
    description: DESCRIPTION,
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Web browser',
    offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
    author: { '@type': 'Person', name: 'Jeremiah Okon', url: SITE_URL },
  };

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: videoToSubtitlesFaqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(webApplicationSchema),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      {/* Cohesive full-viewport backdrop — sits behind the transparent global
          header too, so header and body share one seamless background. */}
      <div className="bg-background pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="bg-sky/20 absolute -top-1/4 -left-1/4 h-[600px] w-[600px] rounded-full blur-[120px]" />
        <div className="bg-sky-deep/15 absolute top-1/3 -right-1/4 h-[500px] w-[500px] rounded-full blur-[100px]" />
        <div className="absolute bottom-0 left-1/3 h-[550px] w-[550px] rounded-full bg-[#a855f7]/10 blur-[110px]" />
      </div>

      <section className="relative flex w-full flex-col items-center px-4 py-20 md:px-10 md:py-28">
        {/* Header */}
        <div className="mb-12 flex flex-col items-center gap-5 text-center">
          <Reveal className="flex flex-col items-center gap-5">
            <TransitionLink href="/tools" className="text-link text-lg">
              back to all tools
            </TransitionLink>
            <span className="font-family-inter text-ink/50 text-xs font-medium tracking-[0.3em] uppercase">
              [ FREE TOOL ]
            </span>
            <h1 className="text-footer-background max-w-3xl text-4xl leading-[1.05] font-bold tracking-tight md:text-6xl lg:text-7xl">
              Turn any video into{' '}
              <span className="font-family-instrument font-normal italic">
                timed subtitles
              </span>
              .
            </h1>
          </Reveal>
          <Reveal
            as="p"
            delay={0.1}
            className="font-family-inter text-ink/50 max-w-xl text-lg md:text-xl"
          >
            Drop in a clip and get timestamped SRT, VTT or JSON back. The speech
            model runs on your own device — nothing is uploaded.
          </Reveal>

          {/* Trust badges */}
          <Reveal
            delay={0.2}
            className="mt-2 flex flex-wrap items-center justify-center gap-3"
          >
            <span className="font-family-inter border-ink/10 bg-ink/[0.03] text-ink/70 flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium">
              <ShieldCheck className="text-sky-deep h-4 w-4" />
              100% private
            </span>
            <span className="font-family-inter border-ink/10 bg-ink/[0.03] text-ink/70 flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium">
              <Zap className="text-sky-deep h-4 w-4" />
              No sign up · No watermark
            </span>
          </Reveal>
        </div>

        <SubtitlerLoader />

        {/* FAQ */}
        <Reveal className="mx-auto mt-20 w-full max-w-3xl">
          <h2 className="text-footer-background text-center text-2xl font-bold tracking-tight md:text-4xl">
            Common{' '}
            <em className="font-family-instrument text-sky-deep font-normal italic">
              questions
            </em>
          </h2>
          <FaqAccordion faqs={videoToSubtitlesFaqs} />
        </Reveal>

        <Reveal className="w-full">
          <BookCallCta location="video_to_subtitles" />
        </Reveal>
      </section>
    </>
  );
}
