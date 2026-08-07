import { YouTubeFacade } from './youtube-facade';

const VIDEO_ID = 'tN3F0NwmBc8';

export default function YouTubeVideo() {
  return (
    <section className="relative flex w-full flex-col items-center gap-8 px-4 py-20 md:gap-12 md:px-10 md:py-32">
      {/* Eyebrow + Heading */}
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="font-family-inter text-xs font-medium tracking-[0.3em] text-[#2C3333]/50 uppercase">
          [ MEET JEREMIAH ]
        </span>
        <h2 className="text-footer-background max-w-3xl text-3xl leading-tight font-bold tracking-tight md:text-5xl lg:text-6xl">
          See how I{' '}
          <span className="font-family-instrument font-normal italic">
            work
          </span>{' '}
          before you hire me.
        </h2>
      </div>

      {/* Video Card */}
      <div className="relative w-full max-w-6xl">
        {/* Gradient halo */}
        <div className="absolute inset-0 -z-10 scale-110 rounded-sm bg-[radial-gradient(circle,_#7BB6DD33_0%,_transparent_70%)] blur-[100px]" />

        <div className="relative overflow-hidden rounded-sm border border-white/20 bg-white/10 p-2 shadow-2xl backdrop-blur-sm md:p-3">
          <div className="relative aspect-video w-full overflow-hidden rounded-sm">
            <YouTubeFacade
              videoId={VIDEO_ID}
              title="Jeremiah Okon - How I Work"
              thumbnailUrl={`https://i.ytimg.com/vi/${VIDEO_ID}/maxresdefault.jpg`}
            />
          </div>
        </div>
      </div>

      {/* Subline */}
      <p className="font-family-inter text-sm font-medium tracking-[0.2em] text-[#2C3333]/40 uppercase">
        4+ years. Real teams. Real results.
      </p>
    </section>
  );
}
