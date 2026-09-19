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
import { WebVitalsReporter } from '@/components/web-vitals-reporter';

import { SITE_URL, X_HANDLE } from '@/lib/constant';

import './globals.css';

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

/**
 * Only the faces something actually renders: no `font-light` exists in `src`,
 * so there's no 300 weight here. Before adding a face, audit usage with:
 *   grep -rhoE "font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)" src | sort | uniq -c
 * `display: 'swap'` is stated explicitly so it isn't removed by accident:
 * without it the fold headline is invisible until the font arrives.
 */
const neueMontreal = localFont({
  src: [
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
  display: 'swap',
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
      'Jeremiah Okon - Full-Stack Product Engineer | React, Next.js & Node.js',
    template: '%s | Jeremiah Okon',
  },
  description:
    'React, Next.js & Node engineer available for remote hire by UK, Ireland & Netherlands teams. Ships telemedicine platforms, multi-role dashboards, fleet analytics.',
  // Region terms below target UK/Ireland/Netherlands hiring searches. Kept as
  // an availability claim ("available for remote hire by"), not a claim of
  // local presence or existing clients there: this is remote work from Nigeria
  // (see the header) and no geo.region meta tag is set for the same reason.
  // Google ignores the keywords tag for ranking, so treat this as an
  // LLM-retrieval/Bing surface, not a primary SEO lever.
  // "HIPAA compliant" deliberately omitted: it's a contractual claim, not just marketing.
  keywords: [
    'hire full stack product engineer',
    'hire freelance Next.js developer',
    'freelance React developer for hire',
    'contract full stack engineer',
    'hire TypeScript developer for SaaS',
    'freelance Node.js developer',
    'remote full stack engineer for hire',
    'hire MVP developer',
    'SaaS MVP development',
    'telemedicine platform development',
    'custom telehealth app development',
    'healthcare SaaS platform development',
    'video consultation app development',
    'fleet analytics dashboard development',
    'driver scoring platform development',
    'telematics dashboard development',
    'multi-role dashboard development',
    'role based access control implementation',
    'RBAC dashboard developer',
    'multi-tenant SaaS dashboard',
    'real-time dashboard development',
    'React Next.js TypeScript developer',
    'end to end product engineer',
    'hire freelance React developer UK',
    'freelance Next.js developer London',
    'hire full stack engineer Netherlands',
    'freelance developer Amsterdam',
    'hire remote developer Dublin',
    'freelance React developer Ireland',
    'Next.js developer for European startups',
    'remote software engineer for UK startups',
    'hire SaaS developer Netherlands',
    'contract developer for UK agencies',
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
      'Jeremiah Okon - Full-Stack Product Engineer | React, Next.js & Node.js',
    description:
      'React, Next.js & Node engineer available for remote hire by UK, Ireland & Netherlands teams. Ships telemedicine platforms, multi-role dashboards, fleet analytics.',
    url: SITE_URL,
    siteName: 'Jeremiah Okon Portfolio',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title:
      'Jeremiah Okon - Full-Stack Product Engineer | React, Next.js & Node.js',
    description:
      'React, Next.js & Node engineer available for remote hire by UK, Ireland & Netherlands teams. Ships telemedicine platforms, multi-role dashboards, fleet analytics.',
    creator: X_HANDLE,
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
  // Bing verification wired the same way as Google's, pending an env var once the property is registered.
  ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ||
  process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
    ? {
        verification: {
          ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
            ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
            : {}),
          ...(process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
            ? {
                other: {
                  'msvalidate.01':
                    process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION,
                },
              }
            : {}),
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
          <a
            href="#main-content"
            className="focus:bg-background focus:text-foreground sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[200] focus:rounded-sm focus:px-4 focus:py-2 focus:outline-2 focus:outline-offset-2"
          >
            Skip to content
          </a>
          <MotionProvider>
            <Header />
            <main id="main-content">{children}</main>
            <Footer />
          </MotionProvider>

          <div className="film-grain" aria-hidden="true" />

          <WebVitalsReporter />
          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID!} />
        </body>
      </html>
    </ViewTransitions>
  );
}
