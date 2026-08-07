import { Link as TransitionLink } from 'next-view-transitions';

import { ShieldCheck, Zap } from 'lucide-react';
import type { Metadata } from 'next';

import { Reveal } from '@/ui/reveal';

import { BookCallCta } from '@/components/book-call-cta';
import AudioExtractorLoader from '@/components/extract-audio/audio-extractor-loader';
import { FaqAccordion } from '@/components/extract-audio/faq-accordion';

import { SITE_URL } from '@/lib/constant';
import { extractAudioFaqs } from '@/lib/extract-audio-faqs';

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
  twitter: {
    card: 'summary_large_image',
    title: 'Free Video to MP3 Audio Extractor',
    description:
      'Pull crisp MP3 audio from any video, entirely in your browser. Private and free.',
  },
};

export default function ExtractAudioPage() {
  const webApplicationSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Free Video to MP3 Audio Extractor',
    url: `${SITE_URL}/extract-audio`,
    description:
      'Extract high-quality MP3 audio from any video right in your browser. 100% private, nothing is uploaded, no sign up required.',
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Web browser',
    offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
    author: { '@type': 'Person', name: 'Jeremiah Okon', url: SITE_URL },
  };

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: extractAudioFaqs.map((faq) => ({
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
        <div className="bg-sky/20 absolute -top-1/4 -left-1/4 h-[600px] w-[600px] rounded-sm blur-[120px]" />
        <div className="bg-sky-deep/15 absolute top-1/3 -right-1/4 h-[500px] w-[500px] rounded-sm blur-[100px]" />
        <div className="absolute bottom-0 left-1/3 h-[550px] w-[550px] rounded-sm bg-[#a855f7]/10 blur-[110px]" />
      </div>

      <section className="relative flex w-full flex-col items-center px-4 py-20 md:px-10 md:py-28">
        {/* Header */}
        <div className="mb-12 flex flex-col items-center gap-5 text-center">
          <Reveal className="flex flex-col items-center gap-5">
            <TransitionLink href="/tools" className="text-link text-lg">
              back to all tools
            </TransitionLink>
            <span className="font-family-inter text-ink/75 text-xs font-medium tracking-[0.3em] uppercase">
              [ FREE TOOL ]
            </span>
            <h1 className="text-footer-background max-w-3xl text-4xl leading-[1.05] font-bold tracking-tight md:text-6xl lg:text-7xl">
              Pull{' '}
              <span className="font-family-instrument font-normal italic">
                crisp audio
              </span>{' '}
              from any video.
            </h1>
          </Reveal>
          <Reveal
            as="p"
            delay={0.1}
            className="font-family-inter text-ink/75 max-w-xl text-lg md:text-xl"
          >
            Drop in a clip and get a high-quality MP3 back in seconds. Runs
            entirely in your browser. Nothing is uploaded.
          </Reveal>

          {/* Trust badges */}
          <Reveal
            delay={0.2}
            className="mt-2 flex flex-wrap items-center justify-center gap-3"
          >
            <span className="font-family-inter border-ink/10 bg-ink/[0.03] text-ink/85 flex items-center gap-2 rounded-sm border px-4 py-2 text-xs font-medium">
              <ShieldCheck className="text-sky-text h-4 w-4" />
              100% private
            </span>
            <span className="font-family-inter border-ink/10 bg-ink/[0.03] text-ink/85 flex items-center gap-2 rounded-sm border px-4 py-2 text-xs font-medium">
              <Zap className="text-sky-text h-4 w-4" />
              No sign up · No watermark
            </span>
          </Reveal>
        </div>

        <AudioExtractorLoader />

        {/* FAQ */}
        <Reveal className="mx-auto mt-20 w-full max-w-3xl">
          <h2 className="text-footer-background text-center text-2xl font-bold tracking-tight md:text-4xl">
            Common{' '}
            <em className="font-family-instrument text-sky-text font-normal italic">
              questions
            </em>
          </h2>
          <FaqAccordion faqs={extractAudioFaqs} />
        </Reveal>

        <Reveal className="w-full">
          <BookCallCta location="extract_audio" />
        </Reveal>
      </section>
    </>
  );
}
