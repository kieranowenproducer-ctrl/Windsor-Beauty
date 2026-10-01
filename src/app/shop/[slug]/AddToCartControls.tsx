'use client';

// Moved out of ProductPageClient.tsx unchanged. Every prop keeps the name it had
// as a local there, so the markup below is the same code that used to live in it.

interface Props {
  qty: number;
  setQty: (update: (q: number) => number) => void;
  stock: number | undefined;
  added: boolean;
  handleAddToCart: () => void;
  handleBuyNow: () => void;
  unavailable: boolean;
  outOfStock: boolean;
  comingSoon: boolean;
  priceTbc: boolean;
}

export default function AddToCartControls({
  qty, setQty, stock, added, handleAddToCart, handleBuyNow, unavailable, outOfStock, comingSoon, priceTbc,
}: Props) {
  return (
    <>
          {/* Qty + Add to cart */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center border border-stone-200">
              <button
                onClick={() => setQty(q => Math.max(1, q - 1))}
                disabled={unavailable}
                className="w-10 h-11 text-stone-500 hover:text-gold-800 transition-colors flex items-center justify-center disabled:opacity-40 disabled:hover:text-stone-500"
              >
                &minus;
              </button>
              <span className="w-10 text-center text-sm text-stone-700 font-medium">{qty}</span>
              <button
                onClick={() => setQty(q => (typeof stock === 'number' ? Math.min(stock, q + 1) : q + 1))}
                disabled={unavailable}
                className="w-10 h-11 text-stone-500 hover:text-gold-800 transition-colors flex items-center justify-center disabled:opacity-40 disabled:hover:text-stone-500"
              >
                +
              </button>
            </div>
            <button
              onClick={handleAddToCart}
              disabled={unavailable || priceTbc}
              className={`flex-1 py-3.5 text-[10px] tracking-[0.22em] uppercase font-semibold transition-all ${
                unavailable || priceTbc
                  ? 'bg-stone-100 text-stone-500 cursor-not-allowed'
                  : added
                  ? 'bg-green-500 text-white'
                  : 'bg-gold-700 text-white hover:bg-gold-800'
              }`}
            >
              {outOfStock ? 'Out of Stock' : comingSoon ? 'Coming Soon' : priceTbc ? 'Pricing Coming Soon' : added ? 'Added to Basket' : 'Add to Basket'}
            </button>
          </div>

          {unavailable || priceTbc ? (
            <span className="block w-full text-center border border-stone-200 text-stone-500 text-[10px] tracking-[0.22em] uppercase py-3.5 mb-6 cursor-not-allowed">
              Buy Now
            </span>
          ) : (
            <button
              type="button"
              onClick={handleBuyNow}
              className="block w-full text-center border border-gold-300 text-gold-700 text-[10px] tracking-[0.22em] uppercase py-3.5 hover:border-gold-500 hover:bg-gold-50 transition-colors mb-6"
            >
              Buy Now
            </button>
          )}
    </>
  );
}
