'use client';

import { useState } from 'react';
import Image from 'next/image';

import { Play } from 'lucide-react';

export function YouTubeFacade({
  videoId,
  title,
  thumbnailUrl,
}: {
  videoId: string;
  title: string;
  thumbnailUrl: string;
}) {
  const [active, setActive] = useState(false);

  if (active) {
    return (
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 h-full w-full"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setActive(true)}
      className="group absolute inset-0 h-full w-full"
      aria-label={`Play ${title}`}
    >
      <Image
        src={thumbnailUrl}
        alt={title}
        fill
        sizes="(max-width: 1152px) 100vw, 1152px"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-black/20 transition-colors duration-300 group-hover:bg-black/30" />
      <span className="absolute top-1/2 left-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow-lg backdrop-blur transition-transform duration-300 group-hover:scale-110">
        <Play className="ml-1 h-8 w-8 fill-[#2C3333] text-[#2C3333]" />
      </span>
    </button>
  );
}
