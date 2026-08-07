import { cn } from '@/lib/utils';

/**
 * The tool panels' icon family.
 *
 * Drawn here rather than imported, for two reasons. The first is that these are
 * the marks on the buttons a user actually presses at the end of a five-minute
 * wait, and a stock icon set is the one part of a page everybody else also has.
 * The second is the motion: an imported icon is a black box you can translate as
 * a whole, whereas owning the paths means the nib can lift off its line, the
 * sparkles can come up around the wand, and the bars can flex — the parts move
 * relative to each other, which is what makes a mark feel alive rather than
 * nudged.
 *
 * **Transitions only — no keyframes, no animation library, no JavaScript.**
 * Every motion here is a hover state on the button's `group`, so it costs one
 * compositor property and nothing at rest. Idle animation was considered and
 * rejected: four icons pulsing on a results panel is a slot machine, not a
 * product. They move when you reach for them.
 *
 * Two SVG-specific details, both load-bearing:
 * - `transform-box: fill-box` on anything that scales or rotates, so the origin
 *   is the shape's own box rather than the whole 24×24 viewBox. Without it a
 *   `scale` about "center" pivots around the wrong point entirely.
 * - `vector-effect: non-scaling-stroke` where a shape scales, so the stroke keeps
 *   its weight instead of fattening with the shape.
 *
 * `motion-reduce` neutralises all of it. Geometry matches lucide's — 24px box,
 * `currentColor`, stroke width 2, round caps — so these sit on the same optical
 * baseline as the stock icons still in use elsewhere.
 */

type GlyphProps = { className?: string };

const BASE = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

/** Shared by every part that transforms: correct origin, honest stroke weight. */
const FX =
  'transition-all duration-300 ease-out [transform-box:fill-box] [vector-effect:non-scaling-stroke] motion-reduce:transition-none';

/**
 * Download — an arrow descending through a break in the ground line.
 *
 * Not the tray-with-an-arrow every toolbar already uses. The break is the only
 * detail, and it sits directly under the arrowhead where the eye already is,
 * which is why the mark still reads at 16px. On hover the arrow steps down as
 * the gap opens to let it through.
 */
export function DownloadGlyph({ className }: GlyphProps) {
  return (
    <svg {...BASE} className={cn('h-4 w-4', className)}>
      <g
        className={cn(
          FX,
          'group-hover:translate-y-[2px] motion-reduce:group-hover:translate-y-0'
        )}
      >
        <path d="M12 3.25v11.5" />
        <path d="M7.75 10.5 12 14.75l4.25-4.25" />
      </g>
      <path
        d="M3.5 19.75h4"
        className={cn(
          FX,
          'group-hover:-translate-x-[2px] motion-reduce:group-hover:translate-x-0'
        )}
      />
      <path
        d="M16.5 19.75h4"
        className={cn(
          FX,
          'group-hover:translate-x-[2px] motion-reduce:group-hover:translate-x-0'
        )}
      />
    </svg>
  );
}

/**
 * Edit — a fountain-pen nib, resting on the line it just wrote.
 *
 * A pencil is what every "edit" affordance on the internet already is, and it
 * says *scribble*. This panel is asking someone to sit with a transcript and
 * correct proper nouns carefully, so the mark is a nib: considered, deliberate,
 * a little formal. The vent hole and the slit are what make it legible as a nib
 * rather than a leaf, and they are the two details that survive to 16px.
 *
 * On hover the nib lifts off the line and the line draws itself in from the
 * left — writing, rather than a pencil waggling.
 */
export function EditGlyph({ className }: GlyphProps) {
  return (
    <svg {...BASE} className={cn('h-4 w-4', className)}>
      {/* The written line. Scales from its left end, so it draws rather than grows. */}
      <path
        d="M4 21.3h16"
        className={cn(
          FX,
          'origin-left scale-x-[0.45] opacity-45',
          'group-hover:scale-x-100 group-hover:opacity-100',
          'motion-reduce:scale-x-100 motion-reduce:opacity-100'
        )}
      />
      {/*
        Upright, and big enough to fill the box.
        Two earlier attempts failed the only test that matters here, which is
        16px: a nib 6 units wide filled in solid — two 1.8 strokes leave a shape
        that narrow almost no inside — and tilting it shrank the drawing further
        to make room for the rotation. The interior void is the entire signal, so
        the nib gets the whole box and the tilt goes.
      */}
      <g
        className={cn(
          FX,
          'group-hover:-translate-y-[1.5px] motion-reduce:group-hover:translate-y-0'
        )}
      >
        <path
          d="M12 17.8 7.2 9.8C7.2 6.2 9.1 3.3 12 1.5c2.9 1.8 4.8 4.7 4.8 8.3Z"
          strokeWidth={1.9}
        />
        {/* Slit, from the tip up to the vent */}
        <path d="M12 17.8v-4" strokeWidth={1.9} />
        {/* Vent hole */}
        <circle cx="12" cy="11.6" r="1.35" strokeWidth={1.7} />
      </g>
    </svg>
  );
}

/**
 * Improve / re-time — a wand with sparkles that come up around it.
 *
 * The sparkles sit at 40% and slightly shrunk at rest, so the mark is calm in a
 * row of four buttons, and bloom to full on hover. They are staggered by 80 ms:
 * simultaneous is a flash, staggered is a shimmer, and the difference is most of
 * why this reads as magic rather than as a blink.
 */
export function WandGlyph({ className }: GlyphProps) {
  return (
    <svg {...BASE} className={cn('h-4 w-4', className)}>
      {/*
        A wand is a stick and a star. The stick stops short of the star rather
        than running into it, which is the whole difference between a wand and a
        hammer — a crossbar at the tip reads as a tool, not as magic.
      */}
      <g
        className={cn(
          FX,
          'origin-bottom-left group-hover:-rotate-[10deg] motion-reduce:group-hover:rotate-0'
        )}
      >
        <path d="M3.5 20.5 12.5 11.5" strokeWidth={2} />
        {/* Four-point sparkle: concave sides are what make it a twinkle rather
            than a diamond. */}
        <path
          d="M16.5 5c.65 2.85 1.5 3.7 4.35 4.35-2.85.65-3.7 1.5-4.35 4.35-.65-2.85-1.5-3.7-4.35-4.35C15 8.7 15.85 7.85 16.5 5Z"
          strokeWidth={1.8}
          className={cn(
            FX,
            'origin-center',
            'group-hover:scale-110 group-hover:rotate-[20deg]',
            'motion-reduce:scale-100 motion-reduce:rotate-0'
          )}
        />
      </g>
      <path
        d="M7.5 3.2v2.6M8.8 4.5H6.2"
        strokeWidth={1.7}
        className={cn(
          FX,
          'origin-center scale-50 opacity-0',
          'group-hover:scale-100 group-hover:opacity-70',
          'motion-reduce:scale-100 motion-reduce:opacity-70'
        )}
      />
      <path
        d="M19.75 16.4v2.2M20.85 17.5h-2.2"
        strokeWidth={1.7}
        className={cn(
          FX,
          'origin-center scale-50 opacity-0 delay-[90ms]',
          'group-hover:scale-100 group-hover:opacity-70',
          'motion-reduce:scale-100 motion-reduce:opacity-70 motion-reduce:delay-0'
        )}
      />
    </svg>
  );
}

/**
 * Audio — five bars that flex into a waveform.
 *
 * At rest they sit near-level, which reads as "audio" without implying anything
 * is playing; on hover they take their peaks, staggered outward from the centre
 * so the shape appears to travel rather than pop. Each bar scales about its own
 * middle, hence `fill-box` — scaling about the viewBox centre would slide the
 * outer bars sideways as they grew.
 */
export function AudioGlyph({ className }: GlyphProps) {
  // Heights are already a wave at rest — a row of equal bars reads as a barcode,
  // and no amount of hover motion recovers a mark that is wrong when still.
  const bars = [
    { x: 3, h: 4.5, peak: 'group-hover:scale-y-[1.7]', delay: 'delay-[140ms]' },
    {
      x: 7.5,
      h: 11,
      peak: 'group-hover:scale-y-[1.35]',
      delay: 'delay-[70ms]',
    },
    { x: 12, h: 17, peak: 'group-hover:scale-y-[1.15]', delay: '' },
    {
      x: 16.5,
      h: 8,
      peak: 'group-hover:scale-y-[1.75]',
      delay: 'delay-[70ms]',
    },
    {
      x: 21,
      h: 4.5,
      peak: 'group-hover:scale-y-[1.6]',
      delay: 'delay-[140ms]',
    },
  ];

  return (
    <svg {...BASE} className={cn('h-4 w-4', className)}>
      {bars.map((bar) => (
        <path
          key={bar.x}
          d={`M${bar.x} ${12 - bar.h / 2}v${bar.h}`}
          className={cn(
            FX,
            'origin-center',
            bar.peak,
            bar.delay,
            'motion-reduce:scale-y-100 motion-reduce:delay-0'
          )}
        />
      ))}
    </svg>
  );
}

/**
 * Start over — an arc that sweeps round on hover.
 *
 * Rotating a full circular arrow is the obvious move and it looks like a loading
 * spinner, which is precisely the wrong thing to promise on a button that resets
 * a finished job. This one turns a third of a turn and stops.
 */
export function RestartGlyph({ className }: GlyphProps) {
  return (
    <svg {...BASE} className={cn('h-4 w-4', className)}>
      <g
        className={cn(
          FX,
          'origin-center group-hover:-rotate-[120deg] motion-reduce:group-hover:rotate-0'
        )}
      >
        <path d="M20.5 12a8.5 8.5 0 1 1-2.49-6.01L20.5 8.5" />
        <path d="M20.5 3.5v5h-5" />
      </g>
    </svg>
  );
}
