'use client';

// Profitability (task 66a6a137 + revision).
// The true cost "to achieve the bottle" = raw unit cost + named cost components you
// define (box, label, anything) + this unit's allocated share of a bulk order's
// shipping. Record bulk purchases (per-order shipping is split across the units in
// that order) and the raw cost + shipping/unit are filled in for you; add box/label
// etc. yourself. Margin = catalogue sale price - total unit cost, per product and category.
import { Fragment, useEffect, useMemo, useState } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { ALL_CATEGORIES, PRODUCTS, mergeProducts, sortVariantsByStrength, type Category, type Product } from '@/data/products';
import type { StockReportRow } from '@/app/api/admin/products/stock-report/route';

interface CostComponent { label: string; amount: number | string; }
interface CostRow {
  product_slug: string; dosage: string; unit_cost: number; components: CostComponent[];
  shipping_per_unit: number; supplier: string | null;
}
interface PurchaseLine { slug: string; dosage: string; qty: number; blockCost: number; }
interface PurchaseRow {
  id: number; supplier: string; purchase_date: string | null; shipping_cost: number;
  update_inventory: boolean; lines: PurchaseLine[];
}

const money = (n: number) => `£${n.toFixed(2)}`;
const keyOf = (slug: string, dosage: string) => `${slug}::${dosage}`;
const emptyComponents = (): CostComponent[] => [{ label: 'Box', amount: 0 }, { label: 'Label', amount: 0 }, { label: '', amount: 0 }, { label: '', amount: 0 }];

// Profitability sections follow the shop's own categories: a product is listed
// under the first category it belongs to, and one with no category goes under
// "Other". Sections are shown in catalogue order, then any admin-made
// categories alphabetically, then "Other".
type Section = string;
const NO_CATEGORY_SECTION = 'Other';
function sectionOf(categories: Category[]): Section {
  return categories[0] || NO_CATEGORY_SECTION;
}
function orderSections(names: string[]): Section[] {
  const known = (ALL_CATEGORIES as readonly string[]).filter((c) => names.includes(c));
  const extra = names.filter((n) => !known.includes(n) && n !== NO_CATEGORY_SECTION).sort((a, b) => a.localeCompare(b));
  return [...known, ...extra, ...(names.includes(NO_CATEGORY_SECTION) ? [NO_CATEGORY_SECTION] : [])];
}

type Variant = { slug: string; name: string; dosage: string; price: number; section: string; onShop: boolean };

// Every catalogue variant, for dropdowns and the cost table, tagged with its section.
// Built from the MERGED catalogue (static file + the admin's saved product
// overrides) — the same source the shop and every other admin page use. Reading
// the static PRODUCTS alone showed this page a stale catalogue: prices the admin
// had set appeared as £0, renamed products kept their old names, and variants
// that had been removed or added were
// wrong. Profitability must mirror the shop.
//
// Every variant is returned, switched-off ones included, each tagged with
// `onShop`. activeVariants() is deliberately NOT used here: it drops
// `enabled: false` variants outright, which is how a size with ten
// units on the shelf vanished from this page entirely while the stock list
// still showed it. Whether a variant is for sale and whether Kieran owns stock
// of it are different questions, and this page answers the second one. The
// filter in `sections` below decides what that means for display.
function buildVariants(overrides: Record<string, Product>): Variant[] {
  return mergeProducts(PRODUCTS, overrides).flatMap((p) =>
    sortVariantsByStrength(p.variants).map((v) => ({
      slug: p.slug, name: p.name, dosage: v.dosage, price: v.price,
      section: sectionOf(p.categories),
      onShop: v.enabled !== false,
    }))
  );
}

export default function ProfitPage() {
  const [overrides, setOverrides] = useState<Record<string, Product>>({});
  const VARIANTS = useMemo(() => buildVariants(overrides), [overrides]);
  const [costs, setCosts] = useState<Record<string, CostRow>>({});
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [stockRows, setStockRows] = useState<StockReportRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { unitCost: string; components: CostComponent[]; supplier: string }>>({});
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = () => {
    Promise.all([
      fetch('/api/admin/product-costs').then((r) => r.json()),
      fetch('/api/admin/supplier-purchases').then((r) => r.json()),
      fetch('/api/admin/products/stock-report', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/admin/products/catalogue', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => (d?.overrides && typeof d.overrides === 'object' ? d.overrides : {}))
        .catch(() => ({})),
    ]).then(([c, p, s, o]) => {
      setOverrides(o as Record<string, Product>);
      const map: Record<string, CostRow> = {};
      for (const row of c.costs ?? []) map[keyOf(row.product_slug, row.dosage)] = row;
      setCosts(map);
      setPurchases(p.purchases ?? []);
      setStockRows(Array.isArray(s.rows) ? s.rows : []);
    }).finally(() => setLoaded(true));
  };
  useEffect(reload, []);

  const totalCostOf = (slug: string, dosage: string): number | null => {
    const c = costs[keyOf(slug, dosage)];
    if (!c) return null;
    const comp = (c.components ?? []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
    return Math.round(((c.unit_cost || 0) + comp + (c.shipping_per_unit || 0)) * 100) / 100;
  };

  function draftOf(slug: string, dosage: string) {
    const k = keyOf(slug, dosage);
    if (drafts[k]) return drafts[k];
    const c = costs[k];
    const comps = c?.components?.length ? [...c.components] : emptyComponents();
    while (comps.length < 4) comps.push({ label: '', amount: 0 });
    return { unitCost: c ? String(c.unit_cost) : '', components: comps.slice(0, 4), supplier: c?.supplier ?? '' };
  }
  function setDraft(slug: string, dosage: string, patch: Partial<{ unitCost: string; components: CostComponent[]; supplier: string }>) {
    const k = keyOf(slug, dosage);
    setDrafts((prev) => ({ ...prev, [k]: { ...draftOf(slug, dosage), ...patch } }));
  }
  async function saveCost(slug: string, dosage: string) {
    const k = keyOf(slug, dosage);
    const d = draftOf(slug, dosage);
    setSavingKey(k);
    try {
      const res = await fetch('/api/admin/product-costs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productSlug: slug, dosage, unitCost: parseFloat(d.unitCost) || 0, components: d.components.filter((c) => c.label || (c.amount !== '' && c.amount != null)).map((c) => ({ label: c.label, amount: parseFloat(String(c.amount)) || 0 })), supplier: d.supplier }),
      });
      const data = await res.json();
      if (res.ok && data.cost) { setCosts((prev) => ({ ...prev, [k]: data.cost })); setOpenKey(null); }
    } finally { setSavingKey(null); }
  }

  // Stock + live/sold state from the merged catalogue (fresh every load), keyed
  // for lookup. status is per product-slug; stock is per slug::dosage.
  const { statusBySlug, soldBySlug, stockByKey } = useMemo(() => {
    const statusBySlug: Record<string, 'enabled' | 'disabled'> = {};
    const soldBySlug: Record<string, number> = {};
    const stockByKey: Record<string, number | null> = {};
    for (const r of stockRows) {
      statusBySlug[r.slug] = r.status;
      soldBySlug[r.slug] = r.sold;
      stockByKey[keyOf(r.slug, r.dosage)] = r.stock;
    }
    return { statusBySlug, soldBySlug, stockByKey };
  }, [stockRows]);

  // Only products that are live on the shop OR have been sold (Kieran's rule:
  // "only live products or products I have sold, not disabled"). Until the stock
  // report has loaded, nothing is marked disabled so everything shows. Grouped
  // into category sections and sorted alphabetically by name then size.
  const sections = useMemo(() => {
    const visible = VARIANTS.filter((v) => {
      // A switched-off SIZE still appears when there is stock of it — that stock
      // is money on a shelf, and a page that silently omits it is lying about the
      // inventory. With none, it stays hidden (a size that isn't sold and isn't
      // held is noise here, task c5842838).
      if (!v.onShop && !((stockByKey[keyOf(v.slug, v.dosage)] ?? 0) > 0)) return false;
      // A switched-off PRODUCT appears only if it has sales history to account for.
      return statusBySlug[v.slug] === 'disabled' ? (soldBySlug[v.slug] ?? 0) > 0 : true;
    });
    const bySec: Record<string, Variant[]> = {};
    for (const v of visible) (bySec[v.section] ??= []).push(v);
    for (const k of Object.keys(bySec)) {
      bySec[k].sort((a, b) => a.name.localeCompare(b.name) || (parseFloat(a.dosage) - parseFloat(b.dosage)));
    }
    return orderSections(Object.keys(bySec)).map((s) => ({ section: s, rows: bySec[s] }));
  }, [VARIANTS, statusBySlug, soldBySlug, stockByKey]);

  const visibleVariants = useMemo(() => sections.flatMap((s) => s.rows), [sections]);

  return (
    <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
      <AdminSidebar />
      <main className="flex-1 px-6 py-8 max-w-5xl overflow-clip">
        <h1 className="text-lg font-semibold text-stone-800">Profitability</h1>
        <p className="text-xs text-stone-500 mt-1 max-w-2xl">
          Record bulk purchases and the cost per unit + a share of that order&apos;s shipping is
          worked out for you. Add box, label and any other costs to get the true cost of each
          bottle. Margin is the catalogue sale price minus that total. Only products that are live
          on the shop or have been sold are listed, with their current stock alongside.
        </p>

        <BulkPurchaseForm onSaved={reload} variants={visibleVariants} />

        {purchases.length > 0 && (
          <details className="mt-4 text-xs">
            <summary className="cursor-pointer text-stone-500 hover:text-stone-700">Recent bulk purchases ({purchases.length})</summary>
            <div className="mt-2 space-y-1">
              {purchases.map((p) => (
                <div key={p.id} className="border border-stone-100 bg-white px-3 py-2 rounded">
                  <span className="font-medium text-stone-700">{p.supplier || 'Supplier'}</span>
                  <span className="text-stone-400"> · {p.purchase_date ?? 'no date'} · shipping {money(p.shipping_cost)}</span>
                  <span className="text-stone-400"> · {p.lines.reduce((s, l) => s + l.qty, 0)} units{p.update_inventory ? ' · added to inventory' : ''}</span>
                  <div className="text-stone-500 mt-0.5">{p.lines.map((l) => `${l.slug} ${l.dosage} ×${l.qty} @ ${money(l.blockCost)}`).join(' · ')}</div>
                </div>
              ))}
            </div>
          </details>
        )}

        <h2 className="text-sm font-semibold text-stone-800 mt-8">Cost &amp; margin by product</h2>
        {!loaded ? (
          <p className="text-xs text-stone-400 mt-4">Loading…</p>
        ) : (
          sections.map(({ section, rows }) => {
            const catMargin = rows.reduce((s, r) => { const t = totalCostOf(r.slug, r.dosage); return t !== null ? s + (r.price - t) : s; }, 0);
            const catStock = rows.reduce((s, r) => { const st = stockByKey[keyOf(r.slug, r.dosage)]; return s + (typeof st === 'number' ? st : 0); }, 0);
            return (
              <section key={section} className="mt-5">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-sm font-semibold text-stone-700">{section}</h3>
                  <span className="text-[11px] text-stone-500 tabular-nums">In stock: <strong>{catStock}</strong> · Total margin (priced): <strong>{money(catMargin)}</strong></span>
                </div>
                <table className="w-full mt-2 text-xs">
                  <thead>
                    <tr className="text-left text-[9px] uppercase tracking-wider text-stone-400 border-b border-stone-200">
                      <th className="py-2">Product</th><th className="py-2 w-14">Size</th>
                      <th className="py-2 w-20 text-right">Sale</th><th className="py-2 w-16 text-right">Stock</th>
                      <th className="py-2 w-24 text-right">Total cost</th>
                      <th className="py-2 w-24 text-right">Margin</th><th className="py-2 w-14 text-right">%</th><th className="py-2 w-16" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const k = keyOf(r.slug, r.dosage);
                      const total = totalCostOf(r.slug, r.dosage);
                      const margin = total !== null ? r.price - total : null;
                      const pct = margin !== null && r.price > 0 ? (margin / r.price) * 100 : null;
                      const open = openKey === k;
                      const d = draftOf(r.slug, r.dosage);
                      const stock = stockByKey[k];
                      const draftTotal = (parseFloat(d.unitCost) || 0) + d.components.reduce((s, c) => s + (Number(c.amount) || 0), 0) + (costs[k]?.shipping_per_unit ?? 0);
                      return (
                        <Fragment key={k}>
                          <tr className="border-b border-stone-100">
                            <td className="py-2 text-stone-700">
                              {r.name}
                              {!r.onShop && (
                                <span
                                  title="Switched off, so it is not for sale on the shop. Listed here because there is still stock of it."
                                  className="ml-2 align-middle text-[9px] uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5"
                                >
                                  Off shop
                                </span>
                              )}
                            </td>
                            <td className="py-2 text-stone-500">{r.dosage}</td>
                            <td className="py-2 text-right tabular-nums text-stone-600">{money(r.price)}</td>
                            <td className={`py-2 text-right tabular-nums ${stock === 0 ? 'text-red-600' : 'text-stone-600'}`}>{typeof stock === 'number' ? stock : '—'}</td>
                            <td className="py-2 text-right tabular-nums text-stone-700">{total !== null ? money(total) : '—'}</td>
                            <td className={`py-2 text-right tabular-nums ${margin !== null && margin < 0 ? 'text-red-600' : 'text-stone-700'}`}>{margin !== null ? money(margin) : '—'}</td>
                            <td className="py-2 text-right tabular-nums text-stone-500">{pct !== null ? `${pct.toFixed(0)}%` : '—'}</td>
                            <td className="py-2 text-right">
                              <button onClick={() => setOpenKey(open ? null : k)} className="text-[10px] uppercase tracking-wider text-gold-700 hover:text-gold-700 font-semibold">{open ? 'Close' : 'Edit'}</button>
                            </td>
                          </tr>
                          {open && (
                            <tr className="bg-stone-50 border-b border-stone-100">
                              <td colSpan={8} className="py-3 px-2">
                                <div className="flex flex-wrap items-end gap-3">
                                  <label className="text-[10px] text-stone-500">Raw unit £
                                    <input inputMode="decimal" value={d.unitCost} onChange={(e) => setDraft(r.slug, r.dosage, { unitCost: e.target.value })} className="block w-20 border border-stone-200 px-2 py-1 text-xs tabular-nums mt-0.5" />
                                  </label>
                                  {d.components.map((c, i) => (
                                    <div key={i} className="flex items-end gap-1">
                                      <label className="text-[10px] text-stone-500">Cost name
                                        <input value={c.label} placeholder={i === 0 ? 'Box' : i === 1 ? 'Label' : 'name'} onChange={(e) => { const nc = [...d.components]; nc[i] = { ...nc[i], label: e.target.value }; setDraft(r.slug, r.dosage, { components: nc }); }} className="block w-24 border border-stone-200 px-2 py-1 text-xs mt-0.5" />
                                      </label>
                                      <label className="text-[10px] text-stone-500">£
                                        <input inputMode="decimal" value={c.amount || ''} onChange={(e) => { const nc = [...d.components]; nc[i] = { ...nc[i], amount: e.target.value }; setDraft(r.slug, r.dosage, { components: nc }); }} className="block w-16 border border-stone-200 px-2 py-1 text-xs tabular-nums mt-0.5" />
                                      </label>
                                    </div>
                                  ))}
                                  <div className="text-[10px] text-stone-500">Shipping/unit<div className="text-xs tabular-nums text-stone-600 mt-1">{money(costs[k]?.shipping_per_unit ?? 0)}</div></div>
                                  <div className="text-[10px] text-stone-500">Total cost<div className="text-xs tabular-nums font-semibold text-stone-800 mt-1">{money(Math.round(draftTotal * 100) / 100)}</div></div>
                                  <button onClick={() => saveCost(r.slug, r.dosage)} disabled={savingKey === k} className="text-[10px] uppercase tracking-wider bg-gold-700 text-white px-3 py-1.5 hover:bg-gold-800 disabled:opacity-50">{savingKey === k ? 'Saving…' : 'Save'}</button>
                                </div>
                                <p className="text-[9px] text-stone-400 mt-2">Raw unit cost + shipping/unit come from bulk purchases (still editable here). Add box, label and any other costs above.</p>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            );
          })
        )}
      </main>
    </div>
  );
}

// ─── Record a bulk order ────────────────────────────────────────────────────────
function BulkPurchaseForm({ onSaved, variants }: { onSaved: () => void; variants: { slug: string; name: string; dosage: string }[] }) {
  const [supplier, setSupplier] = useState('');
  const [date, setDate] = useState('');
  const [shipping, setShipping] = useState('');
  const [adhoc, setAdhoc] = useState('');
  const [updateInventory, setUpdateInventory] = useState(false);
  const [lines, setLines] = useState<Array<{ key: string; qty: string; blockCost: string }>>([{ key: '', qty: '10', blockCost: '' }]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // Same live/sold set as the table below, so a purchase can only be recorded
  // against a product that is actually listed. (No static fallback: the list must
  // come from the merged catalogue the table uses, or this dropdown would offer
  // variants that no longer exist on the shop.)
  const options = variants.map((v) => ({ value: keyOf(v.slug, v.dosage), label: `${v.name} ${v.dosage}` }));

  function setLine(i: number, patch: Partial<{ key: string; qty: string; blockCost: string }>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  async function submit() {
    const payloadLines = lines
      .filter((l) => l.key && Number(l.qty) > 0)
      .map((l) => { const [slug, dosage] = l.key.split('::'); return { slug, dosage: dosage ?? '', qty: Number(l.qty), blockCost: Number(l.blockCost) || 0 }; });
    if (!payloadLines.length) { setMsg('Add at least one product line.'); return; }
    setSaving(true); setMsg('');
    try {
      const res = await fetch('/api/admin/supplier-purchases', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplier, purchaseDate: date || null, shippingCost: Number(shipping) || 0, adhocCost: Number(adhoc) || 0, updateInventory, lines: payloadLines }),
      });
      const data = await res.json();
      if (res.ok) {
        // Say what actually happened to stock, so a ticked box that added 40
        // units reads differently from a save that touched costs only
        // (task c9aa1323).
        const added = Number(data.addedToStock) || 0;
        setMsg(added > 0
          ? `Saved. Costs updated and ${added} unit${added === 1 ? '' : 's'} added to stock.`
          : 'Saved. Costs updated.');
        setSupplier(''); setDate(''); setShipping(''); setAdhoc(''); setUpdateInventory(false); setLines([{ key: '', qty: '10', blockCost: '' }]); onSaved();
      }
      else setMsg(data.error || 'Failed to save.');
    } finally { setSaving(false); }
  }

  return (
    <div className="mt-5 border border-stone-200 bg-white rounded p-4">
      <h2 className="text-sm font-semibold text-stone-800">Record a bulk purchase</h2>
      <p className="text-[11px] text-stone-500 mt-0.5">The order&apos;s shipping and any extra / ad-hoc costs are split evenly across every unit in it and folded into each product&apos;s cost. Raw unit cost = block price ÷ quantity.</p>
      <div className="flex flex-wrap gap-3 mt-3">
        <label className="text-[10px] text-stone-500">Supplier<input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Vendor 1" className="block w-40 border border-stone-200 px-2 py-1 text-xs mt-0.5" /></label>
        <label className="text-[10px] text-stone-500">Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="block w-36 border border-stone-200 px-2 py-1 text-xs mt-0.5" /></label>
        <label className="text-[10px] text-stone-500">Order shipping £<input inputMode="decimal" value={shipping} onChange={(e) => setShipping(e.target.value)} placeholder="55" className="block w-24 border border-stone-200 px-2 py-1 text-xs tabular-nums mt-0.5" /></label>
        <label className="text-[10px] text-stone-500">Extra / ad-hoc £<input inputMode="decimal" value={adhoc} onChange={(e) => setAdhoc(e.target.value)} placeholder="0" className="block w-24 border border-stone-200 px-2 py-1 text-xs tabular-nums mt-0.5" /></label>
        <label className="text-[10px] text-stone-500 flex items-center gap-1 self-end pb-1"><input type="checkbox" checked={updateInventory} onChange={(e) => setUpdateInventory(e.target.checked)} /> Add to product inventory</label>
      </div>
      <table className="w-full mt-3 text-xs">
        <thead><tr className="text-left text-[9px] uppercase tracking-wider text-stone-400"><th className="py-1">Product</th><th className="py-1 w-24">Qty (units)</th><th className="py-1 w-28">Block cost £</th><th className="py-1 w-16" /></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td className="py-1">
                <select value={l.key} onChange={(e) => setLine(i, { key: e.target.value })} className="w-full border border-stone-200 px-2 py-1 text-xs">
                  <option value="">Select a product…</option>
                  {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </td>
              <td className="py-1"><input inputMode="numeric" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} className="w-20 border border-stone-200 px-2 py-1 text-xs tabular-nums" /></td>
              <td className="py-1"><input inputMode="decimal" value={l.blockCost} onChange={(e) => setLine(i, { blockCost: e.target.value })} placeholder="145" className="w-24 border border-stone-200 px-2 py-1 text-xs tabular-nums" /></td>
              <td className="py-1 text-right">{lines.length > 1 && <button onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))} className="text-[10px] text-stone-400 hover:text-red-500">remove</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-3 mt-2">
        <button onClick={() => setLines((p) => [...p, { key: '', qty: '10', blockCost: '' }])} className="text-[10px] uppercase tracking-wider text-stone-500 hover:text-gold-700">+ Add product</button>
        <button onClick={submit} disabled={saving} className="text-[10px] uppercase tracking-wider bg-gold-700 text-white px-4 py-1.5 hover:bg-gold-800 disabled:opacity-50">{saving ? 'Saving…' : 'Record purchase'}</button>
        {msg && <span className="text-[10px] text-stone-500">{msg}</span>}
      </div>
    </div>
  );
}
