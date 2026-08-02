import type { LucideIcon } from 'lucide-react';
import { AudioLines, FileImage, Image as ImageIcon } from 'lucide-react';

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
  {
    slug: 'image-to-webp',
    name: 'Image → WebP Converter',
    tagline: 'Shrink images without losing quality.',
    description:
      'Batch-convert PNG and JPEG images to modern WebP, right in your browser. Same privacy-first engineering as the audio extractor.',
    icon: FileImage,
    perks: ['100% private', 'Batch convert'],
    status: 'soon',
    href: '#',
  },
  {
    slug: 'og-image-generator',
    name: 'OG Image Generator',
    tagline: 'Social preview images in seconds.',
    description:
      'Design and export Open Graph images for your links — no design tool required.',
    icon: ImageIcon,
    perks: ['Free forever', 'Instant export'],
    status: 'soon',
    href: '#',
  },
];
