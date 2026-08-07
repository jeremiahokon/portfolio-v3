import { Star } from 'lucide-react';

import { TrackedLink } from '@/ui/tracked-link';

import { GA_EVENTS } from '@/lib/analytics-events';
import { UPWORK_PROFILE_URL } from '@/lib/constant';

interface Testimonial {
  quote: string;
  project: string;
  period: string;
  rating: number;
  endorsements: string[];
}

// Real client reviews, transcribed verbatim from Upwork.
const testimonials: Testimonial[] = [
  {
    quote:
      'Jeremiah is an Excellent Developer, his communication and Delivery was top-notch, looking forward to work with him next opportunity/time',
    project: 'Fix React rendering issue on website',
    period: 'Mar 2023',
    rating: 5.0,
    endorsements: ['Clear Communicator', 'Reliable', 'Committed to Quality'],
  },
  {
    quote:
      'Jeremiah understands the customer requirement from very little information provided. I love working with him. Am going to hire him for all my future works',
    project: 'React Frontend development',
    period: 'Apr 2023',
    rating: 4.9,
    endorsements: ['Clear Communicator', 'Collaborative'],
  },
  {
    quote:
      'Jeremiah had been resourceful talented person that I look upto for every complex job. I would love to rehire him again and again',
    project: 'React Open Source Contribution',
    period: 'Jun – Aug 2023',
    rating: 4.7,
    endorsements: ['Solution Oriented', 'Committed to Quality'],
  },
  {
    quote:
      'Great attitude, flexibility and communication. Was able to address all the concerns I raised in a thoughtful manner.',
    project: 'Medicovestor Website Revamp',
    period: 'Sep 2025',
    rating: 5.0,
    endorsements: ['Clear Communicator', 'Solution Oriented'],
  },
  {
    quote:
      'Follow-up project completed on time and according to specs like before. Great job!',
    project: 'Dynamic Animations and Interactive Data Visualizations',
    period: 'Sep – Oct 2025',
    rating: 5.0,
    endorsements: ['Reliable', 'Committed to Quality'],
  },
  {
    quote:
      'Jeremiah is a high proficient developer, strong communicator and all around pleasure to work with. Highly recommend him!',
    project: 'Senior frontend developer, Blockchain x AI Company',
    period: 'May – Jul 2026',
    rating: 5.0,
    endorsements: [
      'Committed to Quality',
      'Clear Communicator',
      'Detail Oriented',
    ],
  },
];

function StarRating({ rating }: { rating: number }) {
  return (
    <span
      className="flex items-center gap-1.5"
      aria-label={`Rated ${rating} out of 5 stars`}
    >
      <span className="flex gap-0.5" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <Star
            key={i}
            className={`h-4 w-4 ${
              i < Math.round(rating)
                ? 'fill-[#e58f2a] text-[#e58f2a]'
                : 'fill-[#2C3333]/15 text-[#2C3333]/15'
            }`}
          />
        ))}
      </span>
      <span className="text-sm font-bold text-[#2C3333]">
        {rating.toFixed(1)}
      </span>
    </span>
  );
}

function TestimonialCard({
  quote,
  project,
  period,
  rating,
  endorsements,
}: Testimonial) {
  return (
    <div className="flex w-[320px] flex-shrink-0 flex-col gap-5 rounded-sm border border-[#2C3333]/8 bg-white/60 p-6 backdrop-blur-sm md:w-[400px] md:p-8">
      <div className="flex items-center justify-between">
        <StarRating rating={rating} />
        <span className="font-family-inter rounded-sm bg-[#14a800]/10 px-3 py-1 text-[10px] font-semibold tracking-wide text-[#0a5c00] uppercase">
          via Upwork
        </span>
      </div>
      <p className="font-family-inter text-sm leading-relaxed text-[#2C3333]/85 md:text-base">
        &ldquo;{quote}&rdquo;
      </p>
      <div className="flex flex-wrap gap-2">
        {endorsements.map((endorsement) => (
          <span
            key={endorsement}
            className="font-family-inter rounded-sm bg-[#2C3333]/5 px-3 py-1 text-xs text-[#2C3333]/80"
          >
            {endorsement}
          </span>
        ))}
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-[#2C3333]">{project}</span>
        <span className="font-family-inter text-xs text-[#2C3333]/75">
          {period}
        </span>
      </div>
    </div>
  );
}

export default function Testimonials() {
  const doubled = [...testimonials, ...testimonials];

  return (
    <section
      id="reviews"
      className="relative w-full overflow-hidden py-20 md:py-32"
    >
      {/* Header */}
      <div className="mb-12 flex flex-col items-center gap-4 px-4 text-center md:mb-16 md:px-10">
        <span className="font-family-inter text-xs font-medium tracking-[0.3em] text-[#2C3333]/75 uppercase">
          [ KIND WORDS ]
        </span>
        <h2 className="text-footer-background text-3xl leading-tight font-bold tracking-tight md:text-5xl lg:text-6xl">
          What clients say.
        </h2>
        {UPWORK_PROFILE_URL && (
          <TrackedLink
            href={UPWORK_PROFILE_URL}
            className="font-family-inter text-sm text-[#2C3333]/80 underline underline-offset-4 transition-colors hover:text-[#2C3333]"
            gaEvent={{
              event: GA_EVENTS.UPWORK_ON_TESTIMONIALS,
              value: 'Upwork',
              social_url: UPWORK_PROFILE_URL,
              event_category: 'engagement',
            }}
          >
            All reviews from Upwork ↗
          </TrackedLink>
        )}
      </div>

      {/* Scrolling Cards */}
      <div className="group animate-testimonial-scroll flex w-max gap-5 hover:[animation-play-state:paused] motion-reduce:w-auto motion-reduce:animate-none motion-reduce:flex-wrap motion-reduce:justify-center motion-reduce:px-4">
        {doubled.map((testimonial, i) => (
          <TestimonialCard
            key={`${testimonial.project}-${i}`}
            {...testimonial}
          />
        ))}
      </div>
    </section>
  );
}
