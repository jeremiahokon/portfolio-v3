'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { sendGAEvent } from '@next/third-parties/google';

import { m } from 'motion/react';

import { Reveal } from '@/ui/reveal';

import { useCountUp, useReducedMotion } from '@/lib/hooks';

interface FeaturedCase {
  name: string;
  image: string;
  link: string;
  tag: string;
  description: string;
  // TODO(jeremiah): swap these scope facts for real client outcomes
  // (load-time wins, conversion lifts, revenue) as soon as you have them —
  // measurable results are the strongest conversion device on this page.
  metric: { value: number; unit: string; label: string };
  stack: string;
}

const featuredCases: FeaturedCase[] = [
  {
    name: 'Dokita',
    image: '/assets/webp/dokita.webp',
    link: 'https://dokita-website.vercel.app/',
    tag: 'Telemedicine · Web Platform',
    description:
      'A full-fledged telemedicine platform — online consultations, e-prescriptions, and pharmacy access, with a clinical admin dashboard behind it.',
    metric: {
      value: 5,
      unit: 'apps',
      label: 'shipped in one telemedicine platform',
    },
    stack: 'React · Next.js · TypeScript · Tailwind',
  },
  {
    name: 'DriPA',
    image: '/assets/webp/dripa.webp',
    link: 'https://dripa.ng/',
    tag: 'Driver Performance · Admin Platform',
    description:
      'A driver performance and assurance platform — fleet analytics, driver scoring, and an operations admin dashboard, live in production.',
    metric: {
      value: 3,
      unit: 'dashboards',
      label: 'for fleet analytics, driver scoring & operations',
    },
    stack: 'React · Next.js · TypeScript · Tailwind',
  },
];

interface Project {
  id: number;
  name: string;
  image: string;
  link?: string;
  description: string;
  tag?: string;
}

const projects: Project[] = [
  {
    id: 2,
    name: 'Bitsin Travels and Tours',
    image: '/assets/webp/bitsin.webp',
    link: 'https://www.bitsintravelsandtours.com/',
    description:
      'Travel agency website with booking integration, tour packages, and immersive destination showcases.',
  },
  {
    id: 3,
    name: 'Gaming Website',
    image: '/assets/webp/centryos-gaming-website.webp',
    link: 'https://gaming.centryos.xyz/',
    description:
      'High-energy gaming platform with dynamic content, leaderboards, and community features.',
  },
  {
    id: 4,
    name: 'Torrista',
    image: '/assets/webp/torrista-v2.webp',
    link: 'https://torrista.com.ng/',
    description:
      'Tourism and hospitality platform showcasing local experiences with advanced search and booking flows.',
  },
  {
    id: 5,
    name: 'Medicovestor',
    image: '/assets/webp/medIcovestor.webp',
    link: 'https://medicovestor.com/',
    description:
      'Healthcare investment platform bridging medical professionals with funding opportunities.',
  },
  {
    id: 6,
    name: 'CentryOS Landing Page',
    image: '/assets/webp/centryos-landing-page.webp',
    link: 'https://centryos.xyz/',
    description:
      'Modern SaaS landing page with scroll-driven animations and conversion-optimized layout.',
  },
];

const capabilities = [
  'React & Next.js apps',
  'Node.js APIs & integrations',
  'SaaS dashboards',
  'Performance & Core Web Vitals',
  'Design systems',
  'E-commerce',
];

function FeaturedCaseCard({
  project,
  index,
}: {
  project: FeaturedCase;
  index: number;
}) {
  const prefersReducedMotion = useReducedMotion();
  const { count, ref } = useCountUp(
    project.metric.value,
    prefersReducedMotion ? 0 : 1500,
    true,
    0
  );
  const displayValue = prefersReducedMotion ? project.metric.value : count;
  const imageFirst = index % 2 === 0;

  return (
    <Reveal className="grid items-center gap-8 md:grid-cols-5 md:gap-12">
      <Link
        href={project.link}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          sendGAEvent({
            event: 'project_click',
            value: project.name,
            project_name: project.name,
            project_url: project.link,
            event_category: 'engagement',
            event_label: 'featured_case',
          });
        }}
        className={`group relative block overflow-hidden rounded-2xl shadow-xl md:col-span-3 ${
          imageFirst ? '' : 'md:order-last'
        }`}
      >
        <div className="bg-ink flex items-center gap-1.5 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div className="relative aspect-[16/10] overflow-hidden">
          <Image
            src={project.image}
            alt={project.name}
            fill
            sizes="(min-width: 768px) 60vw, 100vw"
            quality={90}
            className="sda-parallax object-cover object-top transition-transform duration-700 ease-out group-hover:scale-[1.03]"
          />
        </div>
      </Link>

      <div className="flex flex-col gap-4 md:col-span-2">
        <span className="font-family-inter text-sky-deep text-[10px] font-medium tracking-[0.18em] uppercase md:text-xs">
          {project.tag}
        </span>
        <h3 className="text-ink text-3xl font-bold tracking-tight md:text-4xl">
          {project.name}
        </h3>

        <div ref={ref} className="flex flex-col gap-1">
          <span className="text-ink flex items-baseline gap-2.5 text-5xl font-bold tracking-tight md:text-6xl">
            {displayValue}
            <em className="font-family-instrument text-sky-deep text-3xl font-normal italic md:text-4xl">
              {project.metric.unit}
            </em>
          </span>
          <span className="font-family-inter text-ink/50 text-xs leading-snug md:text-sm">
            {project.metric.label}
          </span>
        </div>

        <p className="font-family-inter text-ink/70 text-sm leading-relaxed md:text-base">
          {project.description}
        </p>

        <p className="font-family-inter text-ink/45 text-xs tracking-[0.12em] uppercase">
          {project.stack}
        </p>

        <Link
          href={project.link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-link w-fit text-xl"
          onClick={() => {
            sendGAEvent({
              event: 'project_click',
              value: project.name,
              project_name: project.name,
              project_url: project.link,
              event_category: 'engagement',
              event_label: 'featured_case_link',
            });
          }}
        >
          visit live site <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </Reveal>
  );
}

function ProjectRow({ project, index }: { project: Project; index: number }) {
  const [isHovered, setIsHovered] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const formattedIndex = String(index + 1).padStart(2, '0');

  return (
    <Reveal className="group relative">
      <Link
        href={project.link as string}
        target="_blank"
        rel="noopener noreferrer"
        className="relative flex w-full items-center justify-between px-4 py-6 md:px-10 md:py-8"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={(e) => {
          // On mobile, first tap expands, second tap navigates
          if (window.innerWidth < 768 && !isExpanded) {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
          sendGAEvent({
            event: 'project_click',
            value: project.name,
            project_name: project.name,
            project_url: project.link,
            event_category: 'engagement',
            event_label: 'recent_works_section',
          });
        }}
      >
        {/* Hover background */}
        <m.div
          className="absolute inset-0 bg-[#2C3333]/[0.02]"
          initial={{ opacity: 0 }}
          animate={{ opacity: isHovered ? 1 : 0 }}
          transition={{ duration: 0.3 }}
        />

        {/* Left: Project name + description */}
        <div className="relative z-10 flex items-baseline gap-4 md:gap-6">
          <span className="font-family-inter text-xs font-medium text-[#2C3333]/30 md:text-sm">
            {formattedIndex}
          </span>
          <div className="flex flex-col gap-1">
            {project.tag && (
              <span className="font-family-inter text-[10px] font-medium tracking-[0.18em] text-[#5BA4D1] uppercase md:text-xs">
                {project.tag}
              </span>
            )}
            <h3 className="text-footer-background text-2xl font-bold tracking-tight transition-colors duration-300 md:text-4xl lg:text-5xl">
              {project.name}
            </h3>
            <p className="font-family-inter hidden text-sm leading-relaxed text-[#2C3333]/70 md:block md:text-base">
              {project.description}
            </p>
          </div>
        </div>

        {/* Right: Arrow */}
        <m.div
          className="relative z-10"
          animate={
            prefersReducedMotion
              ? undefined
              : { x: isHovered ? 0 : 10, opacity: isHovered ? 1 : 0.3 }
          }
          transition={{ duration: 0.3 }}
        >
          <svg
            className="h-5 w-5 text-[#2C3333] md:h-7 md:w-7"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="7" y1="17" x2="17" y2="7" />
            <polyline points="7 7 17 7 17 17" />
          </svg>
        </m.div>

        {/* Desktop: Hover image preview */}
        <m.div
          className="pointer-events-none absolute top-1/2 right-24 z-20 hidden -translate-y-1/2 md:block"
          initial={{ opacity: 0, x: 30, scale: 0.95 }}
          animate={
            isHovered
              ? { opacity: 1, x: 0, scale: 1 }
              : { opacity: 0, x: 30, scale: 0.95 }
          }
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="relative h-[280px] w-[480px] overflow-hidden rounded-lg shadow-2xl lg:h-[320px] lg:w-[560px]">
            <Image
              src={project.image}
              alt={project.name}
              fill
              className="object-cover object-top"
              sizes="560px"
              quality={90}
            />
          </div>
        </m.div>
      </Link>

      {/* Mobile expanded content */}
      <m.div
        className="overflow-hidden px-4 md:hidden"
        initial={false}
        animate={{
          height: isExpanded ? 'auto' : 0,
          opacity: isExpanded ? 1 : 0,
        }}
        transition={{ duration: 0.3 }}
      >
        <div className="pb-4">
          <div className="relative mb-3 aspect-video w-full overflow-hidden rounded-lg">
            <Image
              src={project.image}
              alt={project.name}
              fill
              className="object-cover object-top"
              sizes="100vw"
            />
          </div>
          <p className="font-family-inter text-sm leading-relaxed text-[#2C3333]/70">
            {project.description}
          </p>
        </div>
      </m.div>

      {/* Bottom border with hover animation */}
      <div className="relative h-px w-full bg-[#C6C6C6]/50">
        <m.div
          className="absolute top-0 left-0 h-full bg-[#2C3333]"
          initial={{ width: '0%' }}
          animate={{ width: isHovered ? '100%' : '0%' }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </Reveal>
  );
}

export default function RecentWorks() {
  return (
    <section id="work" className="relative flex w-full flex-col py-16 md:py-24">
      {/* Header */}
      <Reveal className="mb-8 flex flex-col items-center gap-4 px-4 text-center md:mb-12 md:px-10">
        <span className="font-family-inter text-xs font-medium tracking-[0.3em] text-[#2C3333]/50 uppercase">
          [ WORK — THE PROOF ]
        </span>
        <h2 className="text-footer-background text-4xl leading-tight font-bold tracking-tight md:text-6xl lg:text-7xl">
          Built to{' '}
          <em className="font-family-instrument font-normal italic">convert</em>
          .
        </h2>

        {/* Capabilities strip — what the killed services grid used to say,
            compressed to one line */}
        <p className="font-family-inter mt-2 flex max-w-4xl flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-xs tracking-[0.12em] text-[#2C3333]/55 uppercase md:text-sm">
          {capabilities.map((capability, index) => (
            <span key={capability} className="flex items-center gap-3">
              {index > 0 && (
                <span aria-hidden="true" className="text-sky-deep">
                  ·
                </span>
              )}
              {capability}
            </span>
          ))}
        </p>
      </Reveal>

      {/* Featured cases with proof metrics */}
      <div className="mx-auto mb-16 flex w-full max-w-6xl flex-col gap-16 px-4 md:mb-24 md:gap-24 md:px-10">
        {featuredCases.map((featured, index) => (
          <FeaturedCaseCard
            key={featured.name}
            project={featured}
            index={index}
          />
        ))}
      </div>

      {/* Top border */}
      <div className="h-px w-full bg-[#C6C6C6]/50" />

      {/* Remaining projects */}
      <div>
        {projects.map((project, index) => (
          <ProjectRow key={project.id} project={project} index={index} />
        ))}
      </div>
    </section>
  );
}
