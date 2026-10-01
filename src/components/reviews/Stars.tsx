// gold-500 = #B8902A, stone-100 = #f5f5f4 (Tailwind defaults for this project)
const GOLD = '#B8902A';
const STONE_LIGHT = '#f5f5f4';

// Each star sits inside a small square box — Trustpilot-inspired but in Windsor
// Glow's gold/white palette. Full stars: gold box + white star. Empty: stone box
// + muted star. Half: split gold|stone gradient box + white star on top.
function StarBox({
  fill,
  id,
  size,
}: {
  fill: 'full' | 'half' | 'empty';
  id: string;
  size: number;
}) {
  const pad = Math.max(3, Math.round(size * 0.2));
  const box = size + pad * 2;
  // Pentagram star path fitted to a 20×20 viewBox.
  const path = 'M10 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L10 14.4l-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z';

  const bgStyle =
    fill === 'full'
      ? { background: GOLD }
      : fill === 'half'
      ? { background: `linear-gradient(to right, ${GOLD} 50%, ${STONE_LIGHT} 50%)` }
      : { background: STONE_LIGHT };

  const starFill = fill === 'empty' ? '#c8c4bc' : 'white';

  return (
    <span
      style={{ width: box, height: box, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...bgStyle }}
      aria-hidden="true"
    >
      <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
        {fill === 'half' && (
          <defs>
            <clipPath id={`${id}-l`}>
              <rect x="0" y="0" width="10" height="20" />
            </clipPath>
            <clipPath id={`${id}-r`}>
              <rect x="10" y="0" width="10" height="20" />
            </clipPath>
          </defs>
        )}
        {fill === 'full' && <path d={path} fill="white" />}
        {fill === 'half' && (
          <>
            <path d={path} fill="white" clipPath={`url(#${id}-l)`} />
            <path d={path} fill="#c8c4bc" clipPath={`url(#${id}-r)`} />
          </>
        )}
        {fill === 'empty' && <path d={path} fill={starFill} />}
      </svg>
    </span>
  );
}

interface StarsProps {
  rating: number;
  size?: number;
  className?: string;
}

export default function Stars({ rating, size = 18, className = '' }: StarsProps) {
  const clamped = Math.max(0, Math.min(5, rating));
  const stars = Array.from({ length: 5 }, (_, i) => {
    const diff = clamped - i;
    if (diff >= 0.75) return 'full' as const;
    if (diff >= 0.25) return 'half' as const;
    return 'empty' as const;
  });

  return (
    // role="img" is what makes the aria-label count. A plain <div> is not
    // allowed to carry one, and assistive software simply drops it — so every
    // star rating on the site, on the homepage and on every review, was
    // announced as nothing at all. The stars are drawn in SVG, so there was no
    // wording underneath for it to fall back on either.
    <div
      role="img"
      className={`flex items-center gap-0.5 ${className}`}
      aria-label={`${rating.toFixed(1)} out of 5 stars`}
    >
      {stars.map((fill, i) => (
        <StarBox key={i} fill={fill} id={`s${rating.toFixed(2).replace('.', '')}-${i}`} size={size} />
      ))}
    </div>
  );
}
