import type { PromotionPreview } from '@/hooks/usePromotionPreview';

// Shared "Promotions applied" summary for the cart and checkout order
// summaries: lists each automatic rule's discount and any free items awarded.
export default function PromotionsAppliedBlock({ preview }: { preview: PromotionPreview | null }) {
  if (!preview || (preview.appliedRules.length === 0 && preview.freeItems.length === 0)) {
    return null;
  }

  return (
    <div className="bg-gold-50/60 border border-gold-100 p-4 mb-4 space-y-1.5">
      <p className="text-[9px] tracking-[0.18em] uppercase text-gold-700 font-semibold mb-1">
        Promotions Applied
      </p>
      {preview.appliedRules.map(rule => (
        <div key={rule.ruleId} className="flex justify-between text-xs gap-3">
          <span className="text-stone-600">{rule.description}</span>
          <span className="text-gold-700 font-medium shrink-0">&minus;&pound;{rule.discountAmount.toFixed(2)}</span>
        </div>
      ))}
      {preview.freeItems.map((item, idx) => (
        <div key={`${item.slug}-${item.dosage}-${idx}`} className="flex justify-between text-xs gap-3">
          <span className="text-stone-600">
            FREE: {item.name} ({item.dosage}) x{item.quantity}
          </span>
          <span className="text-gold-700 font-medium shrink-0">&pound;0.00</span>
        </div>
      ))}
    </div>
  );
}
