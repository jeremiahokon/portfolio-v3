import {
  EMAIL,
  FACEBOOK_URL,
  GITHUB_URL,
  INSTAGRAM_URL,
  LINKEDIN_URL,
  SITE_URL,
  TIKTOK_URL,
  UPWORK_PROFILE_URL,
  X_URL,
  YOUTUBE_CHANNEL_URL,
} from '@/lib/constant';

export default function StructuredData() {
  const personSchema = {
    '@type': 'Person',
    '@id': `${SITE_URL}/#person`,
    name: 'Jeremiah Okon',
    jobTitle: 'Full-Stack Product Engineer',
    description:
      'Full-stack product engineer building production web platforms — telemedicine, fleet analytics, multi-role dashboards — with React, Next.js, TypeScript, and Node.js',
    url: SITE_URL,
    image: `${SITE_URL}/assets/profile.jpg`,
    email: EMAIL,
    // The street-level PostalAddress that used to sit here (Ilorin, Kwara State)
    // is the strongest local-business signal in the whole schema, and it pointed at
    // exactly the market this site is not selling into. The work is remote contract
    // work for clients anywhere, which is what `areaServed: Worldwide` on the service
    // schema now says instead.
    sameAs: [
      LINKEDIN_URL,
      GITHUB_URL,
      YOUTUBE_CHANNEL_URL,
      X_URL,
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
      'Full-Stack Development',
      'Web Application Development',
      'Multi-Role Dashboards',
      'Role-Based Access Control',
      'Telemedicine Platform Development',
      'Fleet Analytics Dashboards',
      'Real-Time Web Features',
      'SaaS Product Development',
      'Tailwind CSS',
      'UI/UX Design',
      'Web Performance',
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
    name: 'Jeremiah Okon - Full-Stack Product Engineer',
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
