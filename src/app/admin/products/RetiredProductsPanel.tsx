'use client';

import { useEffect, useState } from 'react';

// The Retired section of the Products page (task 3378ea2d revision).
// Products Kieran has stopped stocking live here instead of looking like
// "Sold out" on the shop or "needs reordering" on the dashboard. Each one
// can come back two ways: sellable with real stock, or visible as
// "Coming soon" while stock is awaited.

interface RetiredVariant {
  slug: string;
  name: string;
  dosage: string;
  productHidden: boolean;
  quantity: number;
}

export default function RetiredProductsPanel() {
  const [items, setItems] = useState<RetiredVariant[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  /* Asking on the page instead of in a pop-up box (task 38494f7e). A browser pop-up asking for a
   * number is blocked outright on a phone in an in-app browser: the button did nothing at all and
   * nothing on screen said why. Same fault that lost the Send to someone else button. */
  const [askingStock, setAskingStock] = useState<string | null>(null);
  const [stockAnswer, setStockAnswer] = useState('');
  const [askingComingSoon, setAskingComingSoon] = useState<string | null>(null);

  function refresh() {
    return fetch('/api/admin/products/retire')
      .then(res => res.json())
      .then(data => { if (Array.isArray(data.items)) setItems(data.items); })
      .catch(() => {});
  }

  useEffect(() => { refresh(); }, []);

  async function act(item: RetiredVariant, action: 'restore_with_stock' | 'coming_soon', quantity?: number) {
    const key = `${item.slug}::${item.dosage}`;
    setBusy(key);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/admin/products/retire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: item.slug, dosage: item.dosage, action, quantity }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? 'That did not work. Please try again.');
      }
      await refresh();
      setNotice(
        action === 'restore_with_stock'
          ? `${item.name} (${item.dosage}) is back on the shop with ${quantity} in stock. Refresh the page to see it in the product list.`
          : `${item.name} (${item.dosage}) now shows as Coming soon on the shop. Refresh the page to see it in the product list.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  function restoreWithStock(item: RetiredVariant) {
    const quantity = Number(stockAnswer.trim());
    if (!Number.isFinite(quantity) || quantity < 0) {
      setError('That was not a number, so nothing changed.');
      return;
    }
    setAskingStock(null);
    setStockAnswer('');
    void act(item, 'restore_with_stock', Math.round(quantity));
  }

  function markComingSoon(item: RetiredVariant) {
    setAskingComingSoon(null);
    void act(item, 'coming_soon');
  }


  if (items.length === 0 && !notice) return null;

  return (
    <div className="bg-white border border-stone-200 mt-8">
      <div className="px-5 py-4 border-b border-stone-100">
        <p className="text-[9px] tracking-[0.18em] uppercase text-stone-500">
          Retired <span className="text-stone-300 ml-1">({items.length})</span>
        </p>
        <p className="text-[10px] text-stone-500 mt-1">
          Products you have stopped stocking. They never appear in the low-stock warning. One with stock left
          stays on the shop until its last unit sells, then comes off by itself; put one back with real stock
          any time, or show a fully sold one as Coming soon.
        </p>
      </div>
      {error && <p className="text-[10px] text-red-600 px-5 pt-3">{error}</p>}
      {notice && <p className="text-[10px] text-green-700 px-5 pt-3">{notice}</p>}
      {items.length === 0 ? (
        <p className="text-[10px] text-stone-300 px-5 py-5">Nothing is retired.</p>
      ) : (
        <div className="divide-y divide-stone-50">
          {items.map(item => {
            const key = `${item.slug}::${item.dosage}`;
            const busyThis = busy === key;
            return (
              <div key={key} className="px-5 py-3 flex flex-wrap items-center gap-2">
                <span className="flex-1 min-w-[220px] text-[11px] text-stone-700">
                  {item.name} <span className="text-stone-500">({item.dosage})</span>
                  <span className={`ml-2 text-[8px] tracking-wider uppercase px-1.5 py-0.5 ${item.quantity > 0 ? 'bg-gold-50 text-gold-700' : item.productHidden ? 'bg-stone-100 text-stone-500' : 'bg-amber-50 text-amber-600'}`}>
                    {item.quantity > 0
                      ? `Selling the last ${item.quantity}`
                      : item.productHidden ? 'Off the shop' : 'This size hidden'}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setAskingComingSoon(null);
                    setAskingStock(askingStock === key ? null : key);
                    setStockAnswer('');
                  }}
                  disabled={busy !== null}
                  className="bg-gold-700 text-white text-[9px] tracking-[0.14em] uppercase px-3.5 py-2.5 hover:bg-gold-800 transition-colors disabled:opacity-40"
                >
                  {busyThis ? 'Working…' : 'Put back with stock'}
                </button>
                {/* Coming soon is a whole-product state, so it is only offered
                    when the whole product is off the shop — on a product whose
                    other sizes still sell it would block all of them. */}
                {item.productHidden && (
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setAskingStock(null);
                      setAskingComingSoon(askingComingSoon === key ? null : key);
                    }}
                    disabled={busy !== null}
                    className="border border-stone-300 bg-white text-stone-600 text-[9px] tracking-[0.14em] uppercase px-3.5 py-2.5 hover:border-gold-400 hover:text-gold-700 transition-colors disabled:opacity-40"
                  >
                    Show as Coming soon
                  </button>
                )}

                {/* Asked for here rather than in a pop-up box (task 38494f7e): a pop-up asking for
                    a number never appears on a phone in an in-app browser, so the button did
                    nothing and nothing explained why. */}
                {askingStock === key && (
                  <div className="w-full mt-2 border border-gold-200 bg-gold-50/40 px-4 py-3">
                    <label htmlFor={`stock-${key}`} className="block text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-1.5">
                      How many units of {item.name} ({item.dosage}) do you have?
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <input
                        id={`stock-${key}`}
                        type="number"
                        inputMode="numeric"
                        min="0"
                        step="1"
                        value={stockAnswer}
                        onChange={e => setStockAnswer(e.target.value)}
                        placeholder="0"
                        className="w-28 border border-stone-300 px-3 py-2 text-xs text-stone-700 focus:border-gold-700 outline-none bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => restoreWithStock(item)}
                        disabled={busy !== null || stockAnswer.trim() === ''}
                        className="bg-gold-700 text-white text-[9px] tracking-[0.14em] uppercase px-4 py-2 hover:bg-gold-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Put it back
                      </button>
                      <button
                        type="button"
                        onClick={() => { setAskingStock(null); setStockAnswer(''); }}
                        className="text-[9px] tracking-[0.18em] uppercase text-stone-500 px-3 py-2 hover:text-stone-700"
                      >
                        Cancel
                      </button>
                    </div>
                    <p className="text-[10px] text-stone-500 mt-1.5">
                      It goes back on the shop, sellable, with this stock number.
                    </p>
                  </div>
                )}

                {askingComingSoon === key && (
                  <div className="w-full mt-2 border border-stone-300 bg-stone-50 px-4 py-3">
                    <p className="text-[11px] text-stone-800 font-semibold mb-1">
                      Show {item.name} on the shop as Coming soon?
                    </p>
                    <p className="text-[10px] text-stone-600 mb-2.5">
                      Customers will see it but cannot buy it until you add stock.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => markComingSoon(item)}
                        disabled={busy !== null}
                        className="bg-gold-700 text-white text-[9px] tracking-[0.14em] uppercase px-4 py-2 hover:bg-gold-800 transition-colors disabled:opacity-40"
                      >
                        Yes, show it
                      </button>
                      <button
                        type="button"
                        onClick={() => setAskingComingSoon(null)}
                        className="text-[9px] tracking-[0.18em] uppercase text-stone-500 px-3 py-2 hover:text-stone-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
