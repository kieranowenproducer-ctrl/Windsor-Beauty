'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import CarouselArrowButton from '@/components/CarouselArrowButton';

const TESTIMONIALS = [
  {
    src: '/testimonials/customer-testimonial-1.mp4',
    label: 'Customer testimonial one',
    duration: '0:12',
  },
  {
    src: '/testimonials/customer-testimonial-2.mp4',
    label: 'Customer testimonial two',
    duration: '0:23',
  },
  {
    src: '/testimonials/customer-testimonial-3.mp4',
    label: "Reece's customer testimonial",
    duration: '0:17',
  },
] as const;

export type TestimonialLayout = 'spotlight' | 'editorial' | 'duet';

interface Props {
  layout?: TestimonialLayout;
  heading?: boolean;
  className?: string;
}

function SoundIcon({ muted }: { muted: boolean }) {
  return muted ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true" className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5 6.8 8.5H3.5v7h3.3L11 19V5Z" />
      <path strokeLinecap="round" d="m16 9 5 5m0-5-5 5" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true" className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5 6.8 8.5H3.5v7h3.3L11 19V5Z" />
      <path strokeLinecap="round" d="M15 9.5c1.3 1.3 1.3 3.7 0 5M18 7c2.7 2.7 2.7 7.3 0 10" />
    </svg>
  );
}

export default function VideoTestimonials({ layout = 'spotlight', heading = true, className = '' }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [inView, setInView] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.35 },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    videoRefs.current.forEach((video, index) => {
      if (!video) return;
      if (index === activeIndex && inView) {
        video.muted = muted;
        void video.play().catch(() => {
          // Some browsers wait for a customer gesture despite muted autoplay.
        });
      } else {
        video.pause();
      }
    });
  }, [activeIndex, inView, muted]);

  const selectVideo = useCallback((index: number) => {
    if (index === activeIndex) return;
    const previous = videoRefs.current[activeIndex];
    if (previous) {
      previous.pause();
      previous.currentTime = 0;
    }
    setActiveIndex(index);
  }, [activeIndex]);

  const goPrevious = () => selectVideo((activeIndex - 1 + TESTIMONIALS.length) % TESTIMONIALS.length);
  const goNext = () => selectVideo((activeIndex + 1) % TESTIMONIALS.length);

  const toggleSound = () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    const activeVideo = videoRefs.current[activeIndex];
    if (activeVideo) {
      activeVideo.muted = nextMuted;
      if (!nextMuted) void activeVideo.play().catch(() => {});
    }
  };

  const cardPosition = (index: number) => {
    if (layout === 'duet') return index === activeIndex ? 'duet-active' : 'duet-side';
    if (layout === 'editorial') return index === activeIndex ? 'editorial-active' : 'editorial-side';
    if (index === activeIndex) return 'spotlight-active';
    return (index - activeIndex + TESTIMONIALS.length) % TESTIMONIALS.length === 1
      ? 'spotlight-right'
      : 'spotlight-left';
  };

  return (
    <section id="video-testimonials" ref={sectionRef} aria-labelledby="video-testimonials-title" className={className}>
      {heading && (
        <div className="mb-7 text-center sm:mb-9">
          <p className="mb-2 text-[9px] uppercase tracking-[0.38em] text-gold-700">Real experiences</p>
          <h2 id="video-testimonials-title" className="font-serif text-3xl tracking-wide text-stone-800 sm:text-4xl">
            Customer Testimonials
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-stone-500">
            Hear directly from Windsor Beauty customers.
          </p>
        </div>
      )}

      <div
        className={`testimonial-stage testimonial-stage-${layout}`}
        onMouseEnter={() => setInView(true)}
      >
        {TESTIMONIALS.map((testimonial, index) => {
          const active = index === activeIndex;
          return (
            <article
              key={testimonial.src}
              className={`testimonial-video-card ${cardPosition(index)}`}
              aria-current={active ? 'true' : undefined}
            >
              <button
                type="button"
                aria-label={active ? `${testimonial.label}, currently selected` : `Play ${testimonial.label}`}
                onClick={() => selectVideo(index)}
                className="absolute inset-0 z-10 rounded-[inherit] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-700"
              />
              <video
                ref={(node) => { videoRefs.current[index] = node; }}
                src={testimonial.src}
                muted={muted}
                playsInline
                loop
                preload={index === 0 ? 'auto' : 'metadata'}
                aria-label={testimonial.label}
                className="h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/75 via-black/20 to-transparent px-4 pb-4 pt-16 text-white">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-gold-200">Customer story</p>
                    <p className="mt-1 text-xs text-white/80">{testimonial.duration}</p>
                  </div>
                  {active && (
                    <span className="rounded-full border border-white/35 bg-black/30 px-3 py-1.5 text-[9px] uppercase tracking-[0.16em] backdrop-blur-sm">
                      Now playing
                    </span>
                  )}
                </div>
              </div>
              {active && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleSound();
                  }}
                  aria-label={muted ? 'Turn testimonial sound on' : 'Mute testimonial'}
                  className="absolute right-3 top-3 z-30 flex min-h-11 items-center gap-2 rounded-full border border-white/45 bg-black/55 px-3 text-[9px] font-semibold uppercase tracking-[0.14em] text-white shadow-sm backdrop-blur-md transition-colors hover:bg-black/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <SoundIcon muted={muted} />
                  {muted ? 'Sound on' : 'Mute'}
                </button>
              )}
            </article>
          );
        })}
      </div>

      <div className="mt-5 flex items-center justify-center gap-5">
        <CarouselArrowButton direction="left" label="Previous testimonial" onClick={goPrevious} disabled={false} />
        <div className="flex items-center gap-2" role="group" aria-label="Choose a testimonial">
          {TESTIMONIALS.map((testimonial, index) => (
            <button
              key={testimonial.src}
              type="button"
              onClick={() => selectVideo(index)}
              aria-label={`Show testimonial ${index + 1}`}
              aria-current={index === activeIndex ? 'true' : undefined}
              className="flex h-8 w-8 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700"
            >
              <span className={`block rounded-full transition-all duration-300 ${index === activeIndex ? 'h-1.5 w-5 bg-gold-700' : 'h-1.5 w-1.5 bg-stone-300'}`} />
            </button>
          ))}
        </div>
        <CarouselArrowButton direction="right" label="Next testimonial" onClick={goNext} disabled={false} />
      </div>

      <style jsx>{`
        .testimonial-stage {
          position: relative;
          margin: 0 auto;
          overflow: hidden;
        }
        .testimonial-stage-spotlight {
          height: 590px;
          max-width: 820px;
        }
        .testimonial-stage-editorial {
          height: 555px;
          max-width: 820px;
        }
        .testimonial-stage-duet {
          display: flex;
          height: 555px;
          max-width: 760px;
          align-items: center;
          justify-content: center;
          gap: 20px;
          overflow: visible;
        }
        .testimonial-video-card {
          position: absolute;
          top: 50%;
          left: 50%;
          aspect-ratio: 9 / 16;
          overflow: hidden;
          border-radius: 28px;
          background: #171512;
          border: 1px solid rgba(212, 175, 90, 0.34);
          box-shadow: 0 18px 55px rgba(68, 51, 19, 0.12);
          transition: transform 480ms cubic-bezier(0.22, 1, 0.36, 1), opacity 350ms ease, box-shadow 350ms ease;
          transform-origin: center;
        }
        .spotlight-active {
          width: min(78vw, 318px);
          z-index: 20;
          transform: translate(-50%, -50%) scale(1);
          border-color: #d4af5a;
          box-shadow: 0 24px 70px rgba(91, 66, 17, 0.2), 0 0 0 5px rgba(212, 175, 90, 0.08);
        }
        .spotlight-right,
        .spotlight-left {
          width: min(62vw, 250px);
          z-index: 10;
          opacity: 0.74;
          box-shadow: 0 12px 35px rgba(68, 51, 19, 0.1);
        }
        .spotlight-right { transform: translate(32%, -50%) scale(0.88); }
        .spotlight-left { transform: translate(-132%, -50%) scale(0.88); }
        .editorial-active {
          width: min(72vw, 300px);
          z-index: 20;
          transform: translate(-76%, -50%);
          border-radius: 28px 8px 28px 28px;
          border-color: #d4af5a;
        }
        .editorial-side {
          width: min(50vw, 205px);
          z-index: 10;
          opacity: 0.72;
          transform: translate(43%, -50%) scale(0.9);
          border-radius: 8px 28px 28px 28px;
        }
        .duet-active,
        .duet-side {
          position: relative;
          inset: auto;
          width: min(42vw, 285px);
        }
        .duet-active {
          transform: scale(1);
          z-index: 20;
          border-color: #d4af5a;
        }
        .duet-side {
          transform: scale(0.88);
          z-index: 10;
          opacity: 0.7;
        }
        @media (max-width: 639px) {
          .testimonial-stage-spotlight,
          .testimonial-stage-editorial,
          .testimonial-stage-duet {
            height: 520px;
            overflow: hidden;
          }
          .spotlight-active { width: min(76vw, 274px); }
          .spotlight-right,
          .spotlight-left { width: min(58vw, 208px); }
          .spotlight-right { transform: translate(24%, -50%) scale(0.86); }
          .spotlight-left { transform: translate(-124%, -50%) scale(0.86); }
          .editorial-active {
            width: min(75vw, 270px);
            transform: translate(-62%, -50%);
          }
          .editorial-side {
            width: min(48vw, 170px);
            transform: translate(30%, -50%) scale(0.88);
          }
          .testimonial-stage-duet {
            gap: 10px;
            overflow: visible;
          }
          .duet-active,
          .duet-side { width: min(44vw, 210px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .testimonial-video-card { transition: none; }
        }
      `}</style>
    </section>
  );
}
