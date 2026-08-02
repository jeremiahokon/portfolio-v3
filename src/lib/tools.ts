import type { LucideIcon } from 'lucide-react';
import { AudioLines } from 'lucide-react';

export interface Tool {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  icon: LucideIcon;
  perks: string[];
  status: 'live' | 'soon';
  href: string;
}

export const tools: Tool[] = [
  {
    slug: 'extract-audio',
    name: 'Video → MP3 Extractor',
    tagline: 'Pull crisp audio from any video.',
    description:
      'Drop in a clip and get a high-quality MP3 back in seconds. Runs entirely in your browser — nothing is uploaded, no account needed.',
    icon: AudioLines,
    perks: ['100% private', 'No sign up', 'No watermark'],
    status: 'live',
    href: '/extract-audio',
  },
];
