import type { CSSProperties } from 'react';

/** The original artwork's alpha mask preserves the approved lettering and emblem. */
export default function BeautyLogo({
  horizontal = false,
  className = '',
}: {
  horizontal?: boolean;
  className?: string;
}) {
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
