import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// '/index' leaks out of usePathname() during ISR background regeneration
// (vercel/next.js#73085): a strict `pathname === '/'` check fails on deploy.
const HOME_PATHNAMES = new Set(['/', '/index']);

export function isHomePathname(pathname: string | null): boolean {
  return pathname !== null && HOME_PATHNAMES.has(pathname);
}

export function formatCompact(n: number): string {
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function baseName(name: string): string {
  const dot = name.lastIndexOf('.');

  return dot === -1 ? name : name.slice(0, dot);
}
