interface Skill {
  name: string;
  icon: string;
  cdn?: 'devicons' | 'simpleicons';
  variant?: string;
}

const skillRows: Skill[][] = [
  [
    { name: 'React', icon: 'react' },
    { name: 'Next.js', icon: 'nextjs' },
    { name: 'TypeScript', icon: 'typescript' },
    { name: 'JavaScript', icon: 'javascript' },
    { name: 'Tailwind CSS', icon: 'tailwindcss' },
    { name: 'Framer Motion', icon: 'framer', cdn: 'simpleicons' },
    { name: 'Node.js', icon: 'nodejs' },
  ],
  [
    { name: 'HTML5', icon: 'html5' },
    { name: 'CSS3', icon: 'css3' },
    { name: 'Git', icon: 'git' },
    { name: 'Firebase', icon: 'firebase' },
    { name: 'MongoDB', icon: 'mongodb' },
    { name: 'PostgreSQL', icon: 'postgresql' },
    { name: 'Redux', icon: 'redux' },
  ],
  [
    { name: 'Figma', icon: 'figma' },
    { name: 'Vercel', icon: 'vercel' },
    { name: 'Docker', icon: 'docker' },
    { name: 'GraphQL', icon: 'graphql', variant: 'plain' },
    { name: 'REST APIs', icon: 'fastapi' },
    { name: 'Sass', icon: 'sass' },
    { name: 'Webpack', icon: 'webpack' },
  ],
  [
    { name: 'Jest', icon: 'jest', variant: 'plain' },
    { name: 'Storybook', icon: 'storybook' },
    { name: 'Supabase', icon: 'supabase' },
    { name: 'Prisma', icon: 'prisma' },
    { name: 'Radix UI', icon: 'radixui', cdn: 'simpleicons' },
    { name: 'Vite', icon: 'vitejs' },
    { name: 'npm', icon: 'npm' },
  ],
  [
    { name: 'GitHub', icon: 'github' },
    { name: 'VS Code', icon: 'vscode' },
    { name: 'Linux', icon: 'linux' },
    { name: 'Notion', icon: 'notion' },
    { name: 'Stripe', icon: 'stripe', cdn: 'simpleicons' },
    { name: 'Contentful', icon: 'contentful', cdn: 'simpleicons' },
    { name: 'Three.js', icon: 'threejs' },
  ],
];

function getIconUrl(skill: Skill): string {
  if (skill.cdn === 'simpleicons') {
    return `https://cdn.simpleicons.org/${skill.icon}`;
  }
  const variant = skill.variant || 'original';

  return `https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/${skill.icon}/${skill.icon}-${variant}.svg`;
}

function SkillPill({ skill }: { skill: Skill }) {
  return (
    <div className="flex flex-shrink-0 items-center gap-2.5 rounded-sm border border-[#2C3333]/10 bg-white/80 px-5 py-2.5 transition-all duration-300 hover:scale-105 hover:border-[#7BB6DD]/40 hover:shadow-[0_0_20px_rgba(123,182,221,0.2)] md:gap-3 md:px-6 md:py-3">
      <img
        src={getIconUrl(skill)}
        alt={skill.name}
        width={22}
        height={22}
        className="h-5 w-5 md:h-[22px] md:w-[22px]"
        loading="lazy"
      />
      <span className="font-family-inter text-sm font-medium whitespace-nowrap text-[#2C3333] md:text-base">
        {skill.name}
      </span>
    </div>
  );
}

function MarqueeRow({
  skills,
  direction,
}: {
  skills: Skill[];
  direction: 'left' | 'right';
}) {
  // The loop needs three copies of the row to scroll seamlessly, but only one of
  // them is *content*. Rendering all three bare put every tool name in the DOM three
  // times, so a crawler read "React, React, React, Next.js, Next.js, Next.js" — a
  // keyword-stuffing signal produced entirely by an animation detail. The clones are
  // marked aria-hidden (and dropped under reduced motion, where the row wraps into a
  // static grid and duplicates would just be visible repeats).
  const clones = [1, 2];

  return (
    <div className="relative overflow-hidden">
      <div
        className={`flex w-max gap-4 ${
          direction === 'left'
            ? 'animate-marquee-left'
            : 'animate-marquee-right'
        } group-hover:[animation-play-state:paused] motion-reduce:w-auto motion-reduce:animate-none motion-reduce:flex-wrap motion-reduce:justify-center`}
      >
        {skills.map((skill) => (
          <SkillPill key={skill.name} skill={skill} />
        ))}
        {clones.map((copy) => (
          <div
            key={copy}
            aria-hidden="true"
            className="contents motion-reduce:hidden"
          >
            {skills.map((skill) => (
              <SkillPill key={`${skill.name}-${copy}`} skill={skill} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Skills() {
  return (
    <section className="group relative w-full overflow-hidden py-20 md:py-32">
      {/* Header */}
      <div className="mb-12 flex flex-col items-center gap-4 px-4 text-center md:mb-16 md:px-10">
        <span className="font-family-inter text-xs font-medium tracking-[0.3em] text-[#2C3333]/75 uppercase">
          [ STACK ]
        </span>
        <h2 className="text-footer-background max-w-2xl text-3xl leading-tight font-bold tracking-tight md:text-5xl lg:text-6xl">
          Tools I use to build things that{' '}
          <span className="font-family-instrument font-normal italic">
            perform
          </span>
          .
        </h2>
      </div>

      {/* Marquee Rows */}
      <div className="flex flex-col gap-4 md:gap-5">
        {skillRows.map((row, index) => (
          <MarqueeRow
            key={index}
            skills={row}
            direction={index % 2 === 0 ? 'left' : 'right'}
          />
        ))}
      </div>

      {/* The "Currently leveling up: Go" badge used to live here, under the stack
          grid. Two problems: a Go logo sitting inside a row of tools I ship with
          implies I ship with Go, and the manifesto already says "currently learning
          Go" — the honest phrasing, in the one place a reader is being told about
          me rather than about the work. One mention, in the right section. */}
    </section>
  );
}
