import type { CSSProperties } from 'react';

/** The footer keeps its original pewter mask; selected placements use Kieran's exact A sheet. */
export default function BeautyLogo({
  horizontal = false,
  finish = 'pewter',
  className = '',
}: {
  horizontal?: boolean;
  finish?: 'pewter' | 'brushed';
  className?: string;
}) {
  if (finish === 'brushed') {
    const filterId = horizontal ? 'beauty-header-silver-alpha' : 'beauty-home-silver-alpha';
    return (
      <svg
        role="img"
        aria-label="Windsor Beauty"
        data-logo-finish="brushed-silver-a"
        width={horizontal ? 2694 : 1400}
        height={horizontal ? 648 : 1040}
        viewBox={horizontal ? '0 0 2694 648' : '0 0 1400 1040'}
        className={`inline-block shrink-0 ${className}`}
      >
        <defs>
          <filter
            id={filterId}
            filterUnits="userSpaceOnUse"
            x="0"
            y="0"
            width="1536"
            height="1024"
            colorInterpolationFilters="sRGB"
          >
            {/* RGB stays unchanged. Only the pale preview background becomes transparent. */}
            <feColorMatrix
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 -20 0 18.43"
            />
          </filter>
        </defs>
        <svg
          x={horizontal ? 16 : 190}
          y={horizontal ? 16 : 40}
          width={horizontal ? 2662 : 1020}
          height={horizontal ? 616 : 869}
          viewBox={horizontal ? '33 99 1465 339' : '458 438 627 505'}
          preserveAspectRatio="xMidYMid meet"
          overflow="hidden"
        >
          <image
            href="/images/windsor-beauty-brushed-silver-a-20261011.webp"
            width="1536"
            height="1024"
            filter={`url(#${filterId})`}
          />
        </svg>
      </svg>
    );
  }
  const mask = horizontal
    ? '/images/windsor-beauty-logo-transparent.png'
    : '/images/logo-transparent.png';
  const style: CSSProperties = {
    aspectRatio: horizontal ? '2694 / 648' : '1400 / 1040',
    maskImage: `url("${mask}")`,
    WebkitMaskImage: `url("${mask}")`,
    maskSize: 'contain',
    WebkitMaskSize: 'contain',
    maskPosition: 'center',
    WebkitMaskPosition: 'center',
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat',
  };
  return (
    <span
      role="img"
      aria-label="Windsor Beauty"
      className={`inline-block shrink-0 bg-beauty-silver ${className}`}
      style={style}
    />
  );
}
