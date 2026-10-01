import { orderStage, ORDER_STAGE_KEY, type OrderStageInput } from '@/lib/orderStage';

// The coloured square beside an order (task 41a3910f). One component on both screens, so the
// Orders list and the dashboard can never show the same order two different colours.
//
// Colour is never the only thing saying what the square means: every square carries the stage in
// words as its title and its screen-reader label, and the lists show the key above them. A red and
// a green square are the same square to somebody who cannot tell those two apart, which is roughly
// one man in twelve.

export default function OrderStageSquare({ order, className = '' }: { order: OrderStageInput; className?: string }) {
  const stage = orderStage(order);
  return (
    <span
      role="img"
      aria-label={`Stage: ${stage.label}. ${stage.detail}`}
      title={`${stage.label} - ${stage.detail}`}
      className={`inline-block w-3 h-3 border shrink-0 ${stage.swatch} ${className}`}
    />
  );
}

/** The four colours and what they mean, shown once above a list. */
export function OrderStageKey({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 ${className}`}>
      {ORDER_STAGE_KEY.map(({ label, swatch }, i) => (
        <span key={label} className="inline-flex items-center gap-1.5 text-[9px] tracking-[0.12em] uppercase text-stone-500">
          <span className={`inline-block w-2.5 h-2.5 border ${swatch}`} aria-hidden="true" />
          {i + 1}. {label}
        </span>
      ))}
    </div>
  );
}
