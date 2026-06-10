import type { Product } from "@/lib/products";

const ACCENT_FILL: Record<Product["visual"]["accent"], string> = {
  champagne: "fill-brand-champagne",
  "champagne-dark": "fill-brand-champagne-dark",
  charcoal: "fill-brand-charcoal",
  sage: "fill-brand-sage",
};

const GLASS = "fill-white/55 stroke-brand-line";

function ProductLabel({ x, y, w, h, size }: { x: number; y: number; w: number; h: number; size: string }) {
  const cx = x + w / 2;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="2" className="fill-brand-cream stroke-brand-line" strokeWidth="1" />
      <circle cx={cx} cy={y + h * 0.32} r="9" className="fill-none stroke-brand-champagne-dark" strokeWidth="1" />
      <text x={cx} y={y + h * 0.32 + 4} textAnchor="middle" className="fill-brand-charcoal font-display" fontSize="12" fontWeight="600">
        W
      </text>
      <text x={cx} y={y + h * 0.62} textAnchor="middle" className="fill-brand-charcoal" fontSize="4.2" letterSpacing="1" fontWeight="500">
        WINDSOR
      </text>
      <text x={cx} y={y + h * 0.74} textAnchor="middle" className="fill-brand-charcoal" fontSize="4.2" letterSpacing="1.5" fontWeight="500">
        BEAUTY
      </text>
      <line x1={cx - 14} y1={y + h * 0.82} x2={cx + 14} y2={y + h * 0.82} className="stroke-brand-line" strokeWidth="0.75" />
      <text x={cx} y={y + h * 0.94} textAnchor="middle" className="fill-brand-stone" fontSize="4" letterSpacing="1.5">
        {size}
      </text>
    </g>
  );
}

function DropperBottle({ accentClass, size }: { accentClass: string; size: string }) {
  return (
    <>
      <rect x="52" y="78" width="56" height="96" rx="10" className={GLASS} strokeWidth="1.5" />
      <rect x="60" y="86" width="7" height="80" rx="3.5" fill="white" fillOpacity="0.6" />
      <path d="M62 78 L62 60 Q62 54 68 54 L92 54 Q98 54 98 60 L98 78 Z" className={GLASS} strokeWidth="1.5" />
      <rect x="58" y="32" width="44" height="26" rx="5" className={accentClass} />
      <rect x="77" y="14" width="6" height="22" rx="3" className={accentClass} />
      <ellipse cx="80" cy="14" rx="11" ry="9" className={accentClass} />
      <ProductLabel x={56} y={110} w={48} h={48} size={size} />
    </>
  );
}

function PumpBottle({ accentClass, size }: { accentClass: string; size: string }) {
  return (
    <>
      <rect x="44" y="66" width="72" height="110" rx="10" className={GLASS} strokeWidth="1.5" />
      <rect x="52" y="74" width="8" height="94" rx="4" fill="white" fillOpacity="0.6" />
      <rect x="68" y="48" width="24" height="20" rx="3" className={GLASS} strokeWidth="1.5" />
      <rect x="60" y="34" width="40" height="16" rx="5" className={accentClass} />
      <rect x="92" y="28" width="22" height="9" rx="4" className={accentClass} />
      <ProductLabel x={52} y={104} w={56} h={48} size={size} />
    </>
  );
}

function Jar({ accentClass, size }: { accentClass: string; size: string }) {
  return (
    <>
      <rect x="38" y="92" width="84" height="84" rx="12" className={GLASS} strokeWidth="1.5" />
      <rect x="46" y="100" width="9" height="68" rx="4.5" fill="white" fillOpacity="0.6" />
      <rect x="32" y="62" width="96" height="34" rx="10" className={accentClass} />
      <rect x="32" y="62" width="96" height="8" rx="4" fill="white" fillOpacity="0.18" />
      <ProductLabel x={46} y={116} w={68} h={48} size={size} />
    </>
  );
}

function Tube({ accentClass, size }: { accentClass: string; size: string }) {
  return (
    <>
      <path d="M58 176 L58 90 Q58 70 78 70 Q98 70 98 90 L98 176 Z" className={GLASS} strokeWidth="1.5" />
      <rect x="56" y="170" width="44" height="10" rx="2" className={GLASS} strokeWidth="1.5" />
      <rect x="64" y="42" width="28" height="30" rx="6" className={accentClass} />
      <ProductLabel x={52} y={112} w={56} h={48} size={size} />
    </>
  );
}

function SprayBottle({ accentClass, size }: { accentClass: string; size: string }) {
  return (
    <>
      <rect x="46" y="70" width="68" height="106" rx="10" className={GLASS} strokeWidth="1.5" />
      <rect x="54" y="78" width="8" height="90" rx="4" fill="white" fillOpacity="0.6" />
      <rect x="66" y="52" width="28" height="20" rx="3" className={GLASS} strokeWidth="1.5" />
      <rect x="58" y="34" width="44" height="20" rx="6" className={accentClass} />
      <rect x="96" y="30" width="20" height="8" rx="4" className={accentClass} />
      <path d="M62 54 Q50 58 50 68 L58 68 Z" className={accentClass} />
      <ProductLabel x={50} y={108} w={60} h={48} size={size} />
    </>
  );
}

const PACKAGING_SHAPES: Record<Product["packaging"], typeof DropperBottle> = {
  dropper: DropperBottle,
  pump: PumpBottle,
  jar: Jar,
  tube: Tube,
  spray: SprayBottle,
};

export default function ProductIllustration({
  product,
  className = "",
}: {
  product: Product;
  className?: string;
}) {
  const accentClass = ACCENT_FILL[product.visual.accent];
  const Shape = PACKAGING_SHAPES[product.packaging];

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden bg-gradient-to-br ${product.visual.from} ${product.visual.to} ${className}`}
    >
      <svg viewBox="0 0 160 220" className="h-[80%] w-auto" aria-hidden="true">
        <Shape accentClass={accentClass} size={product.size} />
      </svg>
    </div>
  );
}
