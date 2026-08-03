import {
  EMAIL,
  FACEBOOK_URL,
  GITHUB_URL,
  INSTAGRAM_URL,
  LINKEDIN_URL,
  SITE_URL,
  TIKTOK_URL,
  UPWORK_PROFILE_URL,
  YOUTUBE_CHANNEL_URL,
} from '@/lib/constant';

export default function StructuredData() {
  const personSchema = {
    '@type': 'Person',
    '@id': `${SITE_URL}/#person`,
    name: 'Jeremiah Okon',
    jobTitle: 'Frontend & Full-Stack Developer',
    description:
      'Frontend & full-stack developer specializing in React, Next.js, TypeScript, and Node.js',
    url: SITE_URL,
    image: `${SITE_URL}/assets/profile.jpg`,
    email: EMAIL,
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Ilorin',
      addressRegion: 'Kwara State',
      addressCountry: 'Nigeria',
    },
    sameAs: [
      LINKEDIN_URL,
      GITHUB_URL,
      YOUTUBE_CHANNEL_URL,
      TIKTOK_URL,
      INSTAGRAM_URL,
      FACEBOOK_URL,
      ...(UPWORK_PROFILE_URL ? [UPWORK_PROFILE_URL] : []),
    ],
    knowsAbout: [
      'React',
      'Next.js',
      'TypeScript',
      'JavaScript',
      'Node.js',
      'Frontend Development',
      'Web Development',
      'UI/UX Design',
      'Tailwind CSS',
      'Framer Motion',
      'Animation',
      'SEO Optimization',
      'Web Performance',
      'Go (Programming Language)',
    ],
    alumniOf: {
      '@type': 'Organization',
      name: 'University of Ilorin, Ilorin.',
    },
  };

  const profilePageSchema = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url: SITE_URL,
    name: 'Jeremiah Okon - Frontend & Full-Stack Developer',
    mainEntity: personSchema,
  };

  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Jeremiah Okon Portfolio',
    description: 'Portfolio showcasing frontend development work and projects',
    url: SITE_URL,
    author: {
      '@type': 'Person',
      name: 'Jeremiah Okon',
    },
    inLanguage: 'en-US',
  };

  const professionalServiceSchema = {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    name: 'Jeremiah Okon - Frontend & Full-Stack Development Services',
    description:
      'Professional frontend and full-stack development services specializing in React, Next.js, Node.js, and modern web technologies',
    url: SITE_URL,
    telephone: '',
    email: EMAIL,
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Ilorin',
      addressRegion: 'Kwara State',
      addressCountry: 'Nigeria',
    },
    areaServed: 'Worldwide',
    priceRange: '$$',
    // Mirrors the visible Upwork proof: rating in the hero/stats band,
    // review count in the testimonials marquee. Keep all three in sync.
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: 4.9,
      reviewCount: 6,
      bestRating: 5,
    },
    serviceType: [
      'Frontend Development',
      'React Development',
      'Next.js Development',
      'Node.js API Development',
      'Web Application Development',
      'UI/UX Development',
    ],
  };

  const portfolioSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Jeremiah Okon - Portfolio',
    description: 'A collection of frontend development projects and work',
    url: SITE_URL,
    author: {
      '@type': 'Person',
      name: 'Jeremiah Okon',
    },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: [
        {
          '@type': 'CreativeWork',
          name: 'Dokita',
          url: 'https://dokita-website.vercel.app/',
          description: 'Telemedicine web platform built with React & Next.js',
          author: {
            '@type': 'Person',
            name: 'Jeremiah Okon',
          },
        },
        {
          '@type': 'CreativeWork',
          name: 'DriPA',
          url: 'https://dripa.ng/',
          description:
            'Driver performance and assurance admin platform built with React & Next.js',
          author: {
            '@type': 'Person',
            name: 'Jeremiah Okon',
          },
        },
        {
          '@type': 'CreativeWork',
          name: 'Bitsin Travels and Tours',
          url: 'https://www.bitsintravelsandtours.com/',
          description: 'Frontend development project',
          author: {
            '@type': 'Person',
            name: 'Jeremiah Okon',
          },
        },
        {
          '@type': 'CreativeWork',
          name: 'Torrista',
          url: 'https://torrista.com.ng/',
          description: 'Frontend development project',
          author: {
            '@type': 'Person',
            name: 'Jeremiah Okon',
          },
        },
        {
          '@type': 'CreativeWork',
          name: 'Medicovestor',
          url: 'https://medicovestor.com/',
          description: 'Frontend development project',
          author: {
            '@type': 'Person',
            name: 'Jeremiah Okon',
          },
        },
        {
          '@type': 'CreativeWork',
          name: 'CentryOS Landing Page',
          url: 'https://centryos.xyz/',
          description: 'Frontend development project',
          author: {
            '@type': 'Person',
            name: 'Jeremiah Okon',
          },
        },
      ],
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(profilePageSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(professionalServiceSchema),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(portfolioSchema) }}
      />
    </>
  );
}
