'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type * as React from 'react';

/**
 * Tooltips.
 *
 * Radix rather than a hand-rolled div or the native `title` attribute, and the
 * reason is the part that is easy to get wrong. `title` cannot be styled, appears
 * after a delay the user cannot predict, and never appears on touch at all — so on
 * a phone the explanation simply does not exist. A hand-rolled tooltip fixes the
 * look and usually breaks the rest: it needs to open on keyboard focus, close on
 * Escape, flip when it would run off the viewport, and be wired to its trigger with
 * `aria-describedby` so a screen reader reads it. Radix does all of that.
 *
 * These are explanations, never the only source of a label. A control whose meaning
 * lives exclusively in a tooltip is unusable on the devices where tooltips are
 * hardest to reach, so icon-only buttons keep their `aria-label` regardless.
 */

/** Wrap any subtree that contains tooltips. */
export function TooltipProvider({
  delayDuration = 300,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration} {...props}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

/**
 * A trigger and its explanation, in one element.
 *
 * The common case is "this control needs a sentence of context", and making that
 * one component rather than four nested ones is what keeps it cheap enough to add
 * everywhere it is warranted.
 */
export function Tooltip({
  label,
  children,
  side = 'top',
  align = 'center',
  asChild = true,
}: {
  /** The explanation. Keep it to a sentence — this is context, not documentation. */
  label: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  asChild?: boolean;
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild={asChild}>
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className="bg-ink font-family-inter animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 z-50 max-w-[260px] rounded-sm px-2.5 py-1.5 text-[11px] leading-snug text-white shadow-lg"
        >
          {label}
          <TooltipPrimitive.Arrow className="fill-ink" width={10} height={5} />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
