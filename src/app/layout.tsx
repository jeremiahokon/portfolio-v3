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

import { SITE_URL, X_HANDLE } from '@/lib/constant';

import './globals.css';

/**
 * Only the faces something actually renders.
 *
 * The 300 face was declared and preloaded on every route, and **nothing ever
 * selected it** — there is no `font-light` anywhere in `src`. A declared face is a
 * download whether or not an element picks it, so that was 15 KB of every cold visit
 * spent on a weight the site never draws.
 *
 * The four utilities in use resolve to the three faces below: `font-normal` (400) and
 * `font-medium` (500) to Regular and Medium, and both `font-semibold` (600) and
 * `font-black` (900) to Bold, since CSS font matching walks to the nearest declared
 * weight. Audit with:
 *   grep -rhoE "font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)" src | sort | uniq -c
 *
 * `display: 'swap'` is next/font's default and is stated anyway, so nobody removes it
 * believing it changes nothing: without it the headline is invisible until the face
 * arrives, which is the fold text this page is judged on.
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
    'Full-stack product engineer building complex React, Next.js and Node apps — telemedicine platforms, multi-role dashboards, real-time fleet analytics.',
  // Reordered by buyer intent, and stripped of geography.
  //
  // "Web Developer Nigeria", "Ilorin Developer" and "Nigerian Developer" are gone:
  // the work is remote contract work for clients abroad, and a local anchor filters
  // for the market this site is not selling into. Nothing replaces them — no geo
  // terms in either direction. That does cede some traffic (freelance-dev SEO leans
  // hard on location modifiers); "international clients" and "remote" in the visible
  // copy do the qualifying instead.
  //
  // Worth knowing before anyone tunes this list further: Google ignores the keywords
  // meta tag outright. This array is hygiene and LLM-retrieval surface, nothing more.
  // What actually ranks is the visible copy and the depth of the case studies — and
  // the head terms here ("hire React developer") are owned by Toptal, Upwork and Arc
  // and are not winnable. The specific capability phrases are.
  //
  // Deliberately absent: "HIPAA compliant". It is one of the strongest healthcare
  // buyer filters and it is also a contractual claim in the US — BAAs, audits. Not
  // claiming it until a build has actually been scoped that way.
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
      'Full-stack product engineer building complex React, Next.js and Node apps — telemedicine platforms, multi-role dashboards, real-time fleet analytics.',
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
      'Full-stack product engineer building complex React, Next.js and Node apps — telemedicine platforms, multi-role dashboards, real-time fleet analytics.',
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
