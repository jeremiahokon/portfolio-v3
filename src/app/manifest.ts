import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Jeremiah Okon, Frontend Developer',
    short_name: 'Jeremiah Okon',
    description:
      'Experienced Frontend Developer specializing in React, Next.js, and TypeScript.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#2C3333',
    icons: [
      {
        src: '/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
