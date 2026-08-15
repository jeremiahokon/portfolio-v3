import type { LucideIcon } from 'lucide-react';
import { AudioLines, Captions } from 'lucide-react';

export interface Tool {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  icon: LucideIcon;
  /** Button label. Distinct per tool so two cards side by side don't both read
   *  "Open tool" to a screen reader listing the page's links. */
  cta: string;
  perks: string[];
  status: 'live' | 'soon';
  href: string;
}

export const tools: Tool[] = [
  {
    slug: 'extract-audio',
    name: 'Video to Audio Extractor',
    tagline: 'Pull crisp audio from any video.',
    description:
      'Drop in a clip and get a high-quality MP3 back in seconds. Runs entirely in your browser — nothing is uploaded, no account needed.',
    icon: AudioLines,
    cta: 'Extract audio',
    perks: ['100% private', 'No sign up', 'No watermark'],
    status: 'live',
    href: '/extract-audio',
  },
  {
    slug: 'video-to-subtitles',
    name: 'Video to Subtitles Generator',
    tagline: 'Turn any video into timed subtitles.',
    description:
      'Drop in a clip and get timestamped SRT, VTT or JSON back, then correct the transcript in the browser. The speech model runs on your own device — nothing is uploaded.',
    icon: Captions,
    cta: 'Generate subtitles',
    perks: ['100% private', 'No sign up', 'Editable transcript'],
    // Registered only now that it is live, per D13: `tools/page.tsx` never filters
    // on `status`, so a 'soon' entry would render as a card linking nowhere.
    status: 'live',
    href: '/video-to-subtitles',
  },
];
