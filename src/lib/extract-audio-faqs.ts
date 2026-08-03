// The visible FAQ accordion and the FAQPage JSON-LD on /extract-audio must
// stay in sync — search engines penalize structured data that doesn't match
// on-page content. Both read from this single array.
export interface Faq {
  question: string;
  answer: string;
}

export const extractAudioFaqs: Faq[] = [
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
