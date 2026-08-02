import { Link as TransitionLink } from 'next-view-transitions';

import {
  Download,
  FileVideo,
  Lock,
  ShieldCheck,
  Wand2,
  Zap,
} from 'lucide-react';
import type { Metadata } from 'next';

import { BookCallCta } from '@/components/book-call-cta';
import AudioExtractorLoader from '@/components/extract-audio/audio-extractor-loader';

import { SITE_URL } from '@/lib/constant';

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

// Visible FAQ below and the FAQPage JSON-LD must stay in sync — search engines
// penalize structured data that doesn't match on-page content.
const faqs = [
  {
    question: 'Is this video to MP3 extractor really free?',
    answer:
      'Yes — completely free. No sign up, no watermark, and no usage limits.',
  },
  {
    question: 'Are my videos uploaded to a server?',
    answer:
      'No. Everything runs locally in your browser using WebAssembly. Your video never leaves your device, and nothing is stored anywhere.',
  },
  {
    question: 'Which video formats are supported?',
    answer:
      'MP4, MOV, MKV, AVI, WEBM, and M4V files up to 1 GB. That covers screen recordings, phone videos, downloads, and most everything else.',
  },
  {
    question: 'What audio quality does it produce?',
    answer:
      'High-quality variable-bitrate MP3 (around 190 kbps), which preserves the original fidelity for both speech and music.',
  },
];

const steps = [
  {
    icon: FileVideo,
    title: 'Drop in a video',
    body: 'Drag any MP4, MOV, MKV, AVI, WEBM, or M4V file onto the card — or click to browse. Up to 1 GB.',
  },
  {
    icon: Wand2,
    title: 'Audio is extracted locally',
    body: 'A WebAssembly build of FFmpeg pulls the audio track right in your browser tab. Nothing is uploaded.',
  },
  {
    icon: Download,
    title: 'Download your MP3',
    body: 'Preview the result, then save a high-quality MP3 named after your original file.',
  },
];

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
    mainEntity: faqs.map((faq) => ({
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
          <TransitionLink href="/tools" className="text-link text-lg">
            back to all tools
          </TransitionLink>
          <span className="font-family-inter text-ink/50 text-xs font-medium tracking-[0.3em] uppercase">
            [ FREE TOOL ]
          </span>
          <h1 className="text-footer-background max-w-3xl text-4xl leading-[1.05] font-bold tracking-tight md:text-6xl lg:text-7xl">
            Pull{' '}
            <span className="font-family-instrument font-normal italic">
              crisp audio
            </span>{' '}
            from any video.
          </h1>
          <p className="font-family-inter text-ink/50 max-w-xl text-lg md:text-xl">
            Drop in a clip and get a high-quality MP3 back in seconds. Runs
            entirely in your browser. Nothing is uploaded.
          </p>

          {/* Trust badges */}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <span className="font-family-inter border-ink/10 bg-ink/[0.03] text-ink/70 flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium">
              <ShieldCheck className="text-sky-deep h-4 w-4" />
              100% private
            </span>
            <span className="font-family-inter border-ink/10 bg-ink/[0.03] text-ink/70 flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium">
              <Zap className="text-sky-deep h-4 w-4" />
              No sign up · No watermark
            </span>
          </div>
        </div>

        <AudioExtractorLoader />

        {/* How it works */}
        <div className="mx-auto mt-24 w-full max-w-4xl">
          <h2 className="text-footer-background text-center text-2xl font-bold tracking-tight md:text-4xl">
            How it{' '}
            <em className="font-family-instrument text-sky-deep font-normal italic">
              works
            </em>
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {steps.map((step, index) => {
              const Icon = step.icon;

              return (
                <div
                  key={step.title}
                  className="border-ink/10 bg-ink/[0.03] flex flex-col gap-3 rounded-2xl border p-6"
                >
                  <div className="flex items-center gap-3">
                    <span className="bg-sky/15 flex h-10 w-10 items-center justify-center rounded-xl">
                      <Icon
                        className="text-sky-deep h-5 w-5"
                        strokeWidth={1.5}
                      />
                    </span>
                    <span className="font-family-inter text-ink/40 text-xs font-medium tracking-[0.2em] uppercase">
                      Step {index + 1}
                    </span>
                  </div>
                  <h3 className="text-footer-background text-lg font-bold">
                    {step.title}
                  </h3>
                  <p className="font-family-inter text-ink/60 text-sm leading-relaxed">
                    {step.body}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Privacy explainer */}
        <div className="border-ink/10 bg-ink/[0.03] mx-auto mt-16 flex w-full max-w-4xl flex-col items-center gap-4 rounded-3xl border px-6 py-10 text-center md:px-12">
          <span className="bg-sky/15 flex h-12 w-12 items-center justify-center rounded-2xl">
            <Lock className="text-sky-deep h-6 w-6" strokeWidth={1.5} />
          </span>
          <h2 className="text-footer-background text-2xl font-bold tracking-tight md:text-3xl">
            Your files never leave your device.
          </h2>
          <p className="font-family-inter text-ink/60 max-w-2xl text-sm leading-relaxed md:text-base">
            Most online converters upload your video to their servers. This one
            doesn&apos;t — a WebAssembly build of FFmpeg runs inside your
            browser tab, so the extraction happens on your own machine. Close
            the tab and nothing is left behind: no uploads, no accounts, no
            stored files.
          </p>
        </div>

        {/* FAQ */}
        <div className="mx-auto mt-16 w-full max-w-3xl">
          <h2 className="text-footer-background text-center text-2xl font-bold tracking-tight md:text-4xl">
            Common{' '}
            <em className="font-family-instrument text-sky-deep font-normal italic">
              questions
            </em>
          </h2>
          <dl className="mt-10 flex flex-col gap-6">
            {faqs.map((faq) => (
              <div
                key={faq.question}
                className="border-ink/10 rounded-2xl border p-6"
              >
                <dt className="text-footer-background text-base font-bold md:text-lg">
                  {faq.question}
                </dt>
                <dd className="font-family-inter text-ink/60 mt-2 text-sm leading-relaxed">
                  {faq.answer}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <BookCallCta location="extract_audio_page" />
      </section>
    </>
  );
}
