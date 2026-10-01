'use client';

interface Props {
  direction: 'left' | 'right';
  onClick: () => void;
  disabled?: boolean;
  label: string;
  /** sm = 32px, for tight spaces (basket sidebar, the promotion coverflow). md = 40px, the default for full-width carousels. */
  size?: 'sm' | 'md';
  /** Hide below this breakpoint, e.g. 'sm' or 'md' — for arrow sets that only make sense once there's room. */
  hiddenBelow?: 'sm' | 'md';
}

// Shared circular nav control for every horizontal carousel/scroller on the
// site (product rows, reviews, the Special Offers banner, upsell carousel) —
// one gold-filled, white-icon button so every carousel reads as the same
// control, instead of each component styling its own. Disabled state fades
// to a muted grey rather than full gold, signalling the scroll edge.
export default function CarouselArrowButton({ direction, onClick, disabled, label, size = 'md', hiddenBelow }: Props) {
  const sizeClass = size === 'sm' ? 'w-8 h-8' : 'w-10 h-10';
  const iconClass = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const visibilityClass = hiddenBelow === 'sm' ? 'hidden sm:flex' : hiddenBelow === 'md' ? 'hidden md:flex' : 'flex';

  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`shrink-0 ${sizeClass} ${visibilityClass} rounded-full items-center justify-center transition-colors ${
        disabled
          ? 'bg-stone-100 text-stone-500 cursor-not-allowed'
          : 'bg-gold-700 text-white hover:bg-gold-800'
      }`}
    >
      <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={direction === 'left' ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'} />
      </svg>
    </button>
  );
}
