import type { Faq } from '@/lib/extract-audio-faqs';

/**
 * The visible FAQ accordion and the FAQPage JSON-LD on /video-to-subtitles must
 * stay in sync — search engines penalize structured data that doesn't match
 * on-page content. Both read from this single array.
 */
export const videoToSubtitlesFaqs: Faq[] = [
  {
    question: 'Is this subtitle generator really free?',
    answer:
      'Yes — completely free. No sign up, no watermark, and no usage limits. The transcription runs on your own device, so there are no server costs to pass on.',
  },
  {
    question: 'Are my videos uploaded to a server?',
    answer:
      'No. The speech recognition model is downloaded to your browser and runs there. Your video never leaves your device, and nothing is stored anywhere.',
  },
  {
    question: 'Why is there a one-time download the first time?',
    answer:
      'Because the transcription happens on your device, the speech recognition model has to be downloaded once — roughly 170 MB. It is then cached by your browser, so every later visit starts instantly with no download at all.',
  },
  {
    question: 'Which formats can I export?',
    answer:
      'SRT and WebVTT, which cover essentially every video editor and player, plus JSON if you want the raw word-level data with timings and confidence scores.',
  },
  {
    question: 'Which languages does it handle?',
    answer:
      'The model is multilingual and handles most major languages, though it is strongest on English. Accuracy depends a lot on audio quality — clear speech with little background noise transcribes far better than a noisy room.',
  },
  {
    question: 'How accurate are the timings?',
    answer:
      'Accurate enough to caption with, and honest about the difference. Timings start as estimates derived from the speech recogniser, which works at roughly one-second granularity. Precise word-level timing is a separate, optional step you can opt into.',
  },
];
