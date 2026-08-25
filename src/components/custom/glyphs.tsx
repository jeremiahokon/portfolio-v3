import { cn } from '@/lib/utils';

/**
 * Hand-drawn icon set (not imported) so the parts can move independently on hover: nib lifts, sparkles bloom, bars flex.
 * CSS transitions only, no animation library. `transform-box: fill-box` and `vector-effect: non-scaling-stroke` are load-bearing
 * on anything that scales/rotates: without them the origin and stroke weight are wrong. Geometry matches lucide's 24px box.
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

// Not the tray-with-an-arrow every toolbar uses: a break in the ground line opens on hover to let the arrow through.
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

// A nib rather than a pencil: this panel asks for careful correction, not a scribble.
export function EditGlyph({ className }: GlyphProps) {
  return (
    <svg {...BASE} className={cn('h-4 w-4', className)}>
      {/* Scales from its left end, so it draws rather than grows. */}
      <path
        d="M4 21.3h16"
        className={cn(
          FX,
          'origin-left scale-x-[0.45] opacity-45',
          'group-hover:scale-x-100 group-hover:opacity-100',
          'motion-reduce:scale-x-100 motion-reduce:opacity-100'
        )}
      />
      {/* Upright and filling the whole box: two earlier attempts (double-stroke, tilted) failed at 16px. */}
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
        <path d="M12 17.8v-4" strokeWidth={1.9} />
        <circle cx="12" cy="11.6" r="1.35" strokeWidth={1.7} />
      </g>
    </svg>
  );
}

// Sparkles bloom on hover, staggered ~80ms apart: simultaneous reads as a flash, staggered as a shimmer.
export function WandGlyph({ className }: GlyphProps) {
  return (
    <svg {...BASE} className={cn('h-4 w-4', className)}>
      {/* Stick stops short of the star: running into it would read as a hammer, not a wand. */}
      <g
        className={cn(
          FX,
          'origin-bottom-left group-hover:-rotate-[10deg] motion-reduce:group-hover:rotate-0'
        )}
      >
        <path d="M3.5 20.5 12.5 11.5" strokeWidth={2} />
        {/* Concave sides make this read as a twinkle rather than a diamond. */}
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

// Bars flex to their peaks on hover, staggered outward from centre; each scales about its own middle via fill-box.
export function AudioGlyph({ className }: GlyphProps) {
  // Heights already form a wave at rest: equal-height bars would read as a barcode no hover motion could fix.
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

// A full rotation would read as a loading spinner on a button that resets a finished job: this turns a third and stops.
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
