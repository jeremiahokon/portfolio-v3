import { Instrument_Serif } from 'next/font/google';
import localFont from 'next/font/local';
import { ViewTransitions } from 'next-view-transitions';
import { GoogleAnalytics } from '@next/third-parties/google';

import { GeistSans } from 'geist/font/sans';
import type { Metadata } from 'next';

import Footer from '@/components/footer';
import Header from '@/components/header';
import MotionProvider from '@/components/motion-provider';
import StructuredData from '@/components/structured-data';

import { SITE_URL } from '@/lib/constant';

import './globals.css';

const neueMontreal = localFont({
  src: [
    {
      path: '../../public/fonts/NeueMontreal-Light.woff2',
      weight: '300',
      style: 'normal',
    },
    {
      path: '../../public/fonts/NeueMontreal-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../public/fonts/NeueMontreal-Medium.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../../public/fonts/NeueMontreal-Bold.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-neue-montreal',
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument-serif',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default:
      'Jeremiah Okon - Frontend & Full-Stack Developer | React, Next.js & Node.js',
    template: '%s | Jeremiah Okon',
  },
  description:
    'Frontend & full-stack developer specializing in React, Next.js, TypeScript, and Node.js. I build fast, high-converting web apps — from pixel-perfect interfaces to the APIs behind them.',
  keywords: [
    'Frontend Developer',
    'Full-Stack Developer',
    'React Developer',
    'Next.js Developer',
    'Node.js Developer',
    'JavaScript Developer',
    'TypeScript Developer',
    'Web Developer Nigeria',
    'Frontend Engineer',
    'UI/UX Developer',
    'Tailwind CSS',
    'Responsive Web Design',
    'SEO Optimization',
    'Web Performance',
    'Ilorin Developer',
    'Nigerian Developer',
    'Framer Motion',
    'Animation Developer',
    'Portfolio Website',
    'Hire Frontend Developer',
    'Hire Full Stack Developer',
  ],
  authors: [{ name: 'Jeremiah Okon', url: SITE_URL }],
  creator: 'Jeremiah Okon',
  publisher: 'Jeremiah Okon',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title:
      'Jeremiah Okon - Frontend & Full-Stack Developer | React, Next.js & Node.js',
    description:
      'Frontend & full-stack developer specializing in React, Next.js, TypeScript, and Node.js. Fast, high-converting web apps — from pixel-perfect interfaces to the APIs behind them.',
    url: SITE_URL,
    siteName: 'Jeremiah Okon Portfolio',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title:
      'Jeremiah Okon - Frontend & Full-Stack Developer | React, Next.js & Node.js',
    description:
      'Frontend & full-stack developer specializing in React, Next.js, TypeScript, and Node.js. Fast, high-converting web apps.',
    creator: '@okonjeremiah4',
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    other: [
      {
        url: '/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        url: '/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? {
        verification: {
          google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
        },
      }
    : {}),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ViewTransitions>
      <html lang="en" className="scroll-pt-0">
        <head>
          <link rel="preconnect" href="https://cdn.simpleicons.org" />
          <link rel="preconnect" href="https://cdn.jsdelivr.net" />
          <StructuredData />
        </head>
        <body
          className={`${neueMontreal.variable} ${GeistSans.variable} ${instrumentSerif.variable} overflow-x-hidden antialiased`}
        >
          <MotionProvider>
            <Header />
            <main>{children}</main>
            <Footer />
          </MotionProvider>

          {/* Seamless film-grain texture over the whole page */}
          <div className="film-grain" aria-hidden="true" />

          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID!} />
        </body>
      </html>
    </ViewTransitions>
  );
}
