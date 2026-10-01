/*
  The one place a customer's review photo is drawn.

  Why this exists: customers upload whatever their phone took. The live photos
  are a genuine mix of 3:4 portrait (1086x1448, 1536x2048) and 4:3 landscape
  (4032x3024). Every screen used to force that into a fixed box with
  object-cover, which crops. On the homepage carousel a portrait photo was
  rendered into a 302x144 slot, so roughly 36% of the picture survived and the
  vial in it was beheaded top and bottom.

  The rule, and the reason this is a component rather than a class string
  copied around: a review photo is always shown WHOLE, and always inset from
  the edge of whatever is holding it, so it reads as a framed photograph. Any
  new screen that shows a review photo imports this and cannot reintroduce the
  crop by hand.

  Making it whole means the frame is rarely the same shape as the photo. The
  leftover space is filled with a soft, heavily blurred copy of the photo
  itself rather than a flat grey bar, so a portrait picture sits on a wash of
  its own colours instead of in a dead letterbox.
*/

'use client';

import { useState } from 'react';

type Variant = 'card' | 'inline' | 'thumb' | 'preview';

interface Props {
  src: string;
  /** Where it is being shown, which sets the frame size and border treatment. */
  variant?: Variant;
  alt?: string;
  className?: string;
}

// Frame sizes per surface. Heights are fixed on purpose: the homepage
// carousel overlaps and scales its cards, so every card has to be the same
// height or the coverflow jumps as it rotates.
const FRAME: Record<Variant, string> = {
  // Homepage carousel. The height is what decides how big a portrait photo can
  // be, since a 3:4 picture is limited by the frame's height and not its width.
  // At h-72 a portrait renders about 198px wide inside a 302px card on a phone,
  // which reads as a photograph. Any shorter and it shrinks to a stamp.
  card: 'w-full h-72 sm:h-80 border-b border-gold-100',
  // /reviews and the product pages, where cards are stacked full width.
  inline: 'w-full max-w-[20rem] h-64 border border-gold-100',
  // Admin approval queue. The moderator is deciding whether this photo goes on
  // the shop front, so they see all of it before they approve it.
  thumb: 'w-40 h-40 border border-stone-200',
  // The customer's own preview of what they just picked, before they submit.
  preview: 'w-20 h-20 border border-stone-200',
};

// How far the photo sits in from the edge of its frame.
const INSET: Record<Variant, string> = {
  card: 'p-3 sm:p-4',
  inline: 'p-3 sm:p-4',
  thumb: 'p-2',
  preview: 'p-1',
};

export default function ReviewPhoto({
  src,
  variant = 'card',
  alt = 'Photo submitted with this review',
  className = '',
}: Props) {
  // A review row outlives the blob its photo lives in: deleting a photo from
  // storage leaves the row's image_url pointing at nothing. Rather than parade
  // a broken-image icon in a 288px frame, the frame removes itself and the
  // card reads as a text-only review.
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  const blurred = variant !== 'preview';

  return (
    <div className={`relative overflow-hidden bg-stone-100 ${FRAME[variant]} ${className}`}>
      {blurred && (
        <>
          {/* The wash: the same photo, scaled to fill, blurred past legibility.
              Decorative only, so it is hidden from screen readers and never
              announced twice. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- the decorative blurred wash behind the photo. It is the same customer-uploaded image again, hidden from screen readers, and next/image would need dimensions it does not have. */}
          <img
            src={src}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover scale-125 blur-2xl opacity-45 pointer-events-none"
          />
          {/* Warm veil over the wash so it stays a Windsor Beauty surface rather
              than a muddy smear of whatever the customer's carpet looked like. */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/55 via-white/35 to-gold-50/55 pointer-events-none" />
        </>
      )}

      {/* The photo itself: contained, so all of it is visible whatever shape it
          is, and inset so it reads as a framed print sitting on the wash. */}
      <div className={`relative w-full h-full flex items-center justify-center ${INSET[variant]}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a customer-uploaded review photo of unknown shape and size. next/image needs the dimensions up front, and the whole point here is that any shape is shown in full. */}
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
          className="max-w-full max-h-full w-auto h-auto object-contain shadow-[0_2px_10px_rgba(60,50,30,0.18)]"
        />
      </div>
    </div>
  );
}
