'use client';

// Trial products + profitability (task 96b2ffe7). A separate, admin-only area
// for products Kieran is trialing. NONE of this appears on the public shop: it
// has its own table and API. It mirrors the real Products and Profitability
// sections, so it works the same way, just isolated for inventory and accounting.
import { useEffect, useMemo, useState } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { trialRoyalMailRef } from '@/lib/trialRoyalMailRef';
import { useConfirm } from '@/components/admin/ConfirmProvider';

interface Comp { label: string; amount: number | string }
interface Variant { dosage: string; price: number | string; stock: number | string; rawCost: number | string; components: Comp[]; shipping: number | string }
interface TrialProduct { id: number; productCode: string; name: string; category: string; variants: Variant[]; updated_at: string }

const money = (n: number) => `£${n.toFixed(2)}`;
const num = (v: number | string) => (Number(v) || 0);
const totalCost = (v: Variant) => Math.round((num(v.rawCost) + (v.components || []).reduce((s, c) => s + num(c.amount), 0) + num(v.shipping)) * 100) / 100;

function blankComponents(): Comp[] {
  return [{ label: 'Box', amount: '' }, { label: 'Label', amount: '' }, { label: '', amount: '' }, { label: '', amount: '' }];
}
function blankVariant(): Variant {
  return { dosage: '', price: '', stock: '', rawCost: '', components: blankComponents(), shipping: '' };
}

export default function TrialPage() {
  const confirm = useConfirm();
  const [tab, setTab] = useState<'products' | 'profit'>('products');
  const [products, setProducts] = useState<TrialProduct[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<TrialProduct | null>(null);
  const [error, setError] = useState('');

  const reload = () => {
    fetch('/api/admin/trial-products', { cache: 'no-store' })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok || !Array.isArray(d.products)) throw new Error(d.error || 'Could not load Trial products.');
        return d.products as TrialProduct[];
      })
      .then((rows) => { setProducts(rows); setError(''); })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load Trial products.'))
      .finally(() => setLoaded(true));
  };
  useEffect(reload, []);

  async function remove(id: number) {
    if (!(await confirm({
      title: 'Delete this trial product?',
      body: 'This cannot be undone.',
      confirmLabel: 'Yes, delete it',
      cancelLabel: 'Keep it',
      tone: 'danger',
    }))) return;
    await fetch(`/api/admin/trial-products?id=${id}`, { method: 'DELETE' }).catch(() => {});
    reload();
  }

  return (
    <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
      <AdminSidebar />
      <main className="flex-1 px-6 py-8 max-w-5xl overflow-clip">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-stone-800">Trial products</h1>
          <span className="text-[9px] uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5">Admin only, never on the website</span>
        </div>
        <p className="text-xs text-stone-500 mt-1 max-w-2xl">
          A separate inventory for products you are trialing. It works the same as the main Products
          and Profitability sections, but nothing here is ever shown on the shop. For your inventory
          and accounting only.
        </p>

        <div className="mt-5 flex gap-1 border-b border-stone-200">
          {([['products', 'Products (Trial)'], ['profit', 'Profitability (Trial)']] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-4 py-2 text-xs font-semibold -mb-px border-b-2 transition-colors ${tab === k ? 'border-gold-500 text-stone-800' : 'border-transparent text-stone-500 hover:text-stone-600'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
        {!loaded ? (
          <p className="text-xs text-stone-500 mt-6">Loading…</p>
        ) : tab === 'products' ? (
          <ProductsTab products={products} onEdit={setEditing} onAdd={() => setEditing({ id: 0, productCode: '', name: '', category: '', variants: [blankVariant()], updated_at: '' })} onDelete={remove} />
        ) : (
          <ProfitTab products={products} />
        )}
      </main>

      {editing && (
        <Editor
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
          onError={setError}
        />
      )}
    </div>
  );
}

// ─── Products tab ───────────────────────────────────────────────────────────────
function ProductsTab({ products, onEdit, onAdd, onDelete }: { products: TrialProduct[]; onEdit: (p: TrialProduct) => void; onAdd: () => void; onDelete: (id: number) => void }) {
  return (
    <div className="mt-5">
      <button onClick={onAdd} className="text-[10px] uppercase tracking-wider bg-gold-700 text-white px-4 py-2 hover:bg-gold-800">+ Add trial product</button>
      {products.length === 0 ? (
        <p className="text-xs text-stone-500 mt-6">No trial products yet. Add one to get started.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] text-xs">
          <thead>
            <tr className="text-left text-[9px] uppercase tracking-wider text-stone-500 border-b border-stone-200">
              <th className="py-2">Product</th><th className="py-2 w-28">Category</th>
              <th className="py-2 w-40">Sizes</th><th className="py-2 w-16 text-right">Stock</th>
              {/* Read-only permanent code, assigned on creation. */}
              <th className="py-2 w-32 pl-6">Product code</th><th className="py-2 w-24" />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-stone-100 align-top">
                <td className="py-2 text-stone-700 font-medium">{p.name}</td>
                <td className="py-2 text-stone-500">{p.category}</td>
                <td className="py-2 text-stone-500">{p.variants.map((v) => `${v.dosage || '-'} (${money(num(v.price))})`).join(', ') || '-'}</td>
                <td className="py-2 text-right tabular-nums text-stone-600">{p.variants.reduce((s, v) => s + num(v.stock), 0)}</td>
                <td className="py-2 pl-6 text-stone-500 whitespace-nowrap" title="Permanent code for this Trial product. It is used as its Royal Mail product name.">
                  {trialRoyalMailRef(p.id, p.productCode)}
                </td>
                <td className="py-2 text-right">
                  <button onClick={() => onEdit(p)} className="text-[10px] uppercase tracking-wider text-gold-700 hover:text-gold-700 font-semibold mr-3">Edit</button>
                  <button onClick={() => onDelete(p.id)} className="text-[10px] uppercase tracking-wider text-stone-500 hover:text-red-500">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}

// ─── Profitability tab ──────────────────────────────────────────────────────────
function ProfitTab({ products }: { products: TrialProduct[] }) {
  const sections = useMemo(() => {
    const bySec: Record<string, { product: string; v: Variant }[]> = {};
    for (const p of products) for (const v of p.variants) (bySec[p.category || 'Uncategorised'] ??= []).push({ product: p.name, v });
    return Object.keys(bySec).sort().map((section) => ({ section, rows: bySec[section] }));
  }, [products]);

  if (products.length === 0) return <p className="text-xs text-stone-500 mt-6">No trial products yet. Add products in the first tab to see their profitability here.</p>;

  return (
    <div className="mt-5">
      <p className="text-xs text-stone-500 max-w-2xl">Total cost = raw cost + named costs (box, label, etc.) + shipping per unit. Margin = sale price minus total cost, per product and category.</p>
      {sections.map(({ section, rows }) => {
        const catMargin = rows.reduce((s, r) => s + (num(r.v.price) - totalCost(r.v)), 0);
        const catStock = rows.reduce((s, r) => s + num(r.v.stock), 0);
        return (
          <section key={section} className="mt-5">
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="text-sm font-semibold text-stone-700">{section}</h3>
              <span className="text-[11px] text-stone-500 tabular-nums">In stock: <strong>{catStock}</strong> · Total margin: <strong>{money(catMargin)}</strong></span>
            </div>
            <table className="w-full mt-2 text-xs">
              <thead>
                <tr className="text-left text-[9px] uppercase tracking-wider text-stone-500 border-b border-stone-200">
                  <th className="py-2">Product</th><th className="py-2 w-14">Size</th>
                  <th className="py-2 w-20 text-right">Sale</th><th className="py-2 w-16 text-right">Stock</th>
                  <th className="py-2 w-24 text-right">Total cost</th><th className="py-2 w-24 text-right">Margin</th><th className="py-2 w-14 text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const cost = totalCost(r.v);
                  const margin = num(r.v.price) - cost;
                  const pct = num(r.v.price) > 0 ? (margin / num(r.v.price)) * 100 : null;
                  return (
                    <tr key={i} className="border-b border-stone-100">
                      <td className="py-2 text-stone-700">{r.product}</td>
                      <td className="py-2 text-stone-500">{r.v.dosage || '-'}</td>
                      <td className="py-2 text-right tabular-nums text-stone-600">{money(num(r.v.price))}</td>
                      <td className="py-2 text-right tabular-nums text-stone-600">{num(r.v.stock)}</td>
                      <td className="py-2 text-right tabular-nums text-stone-700">{money(cost)}</td>
                      <td className={`py-2 text-right tabular-nums ${margin < 0 ? 'text-red-600' : 'text-stone-700'}`}>{money(margin)}</td>
                      <td className="py-2 text-right tabular-nums text-stone-500">{pct !== null ? `${pct.toFixed(0)}%` : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}

// ─── Add / edit a trial product ───────────────────────────────────────────────────
function Editor({ initial, onClose, onSaved, onError }: { initial: TrialProduct; onClose: () => void; onSaved: () => void; onError: (e: string) => void }) {
  const [name, setName] = useState(initial.name);
  const [category, setCategory] = useState(initial.category);
  const [variants, setVariants] = useState<Variant[]>(initial.variants.length ? initial.variants.map((v) => ({ ...v, components: [...(v.components || []), ...blankComponents()].slice(0, 4) })) : [blankVariant()]);
  const [saving, setSaving] = useState(false);

  function setV(i: number, patch: Partial<Variant>) { setVariants((prev) => prev.map((v, idx) => (idx === i ? { ...v, ...patch } : v))); }
  function setComp(i: number, ci: number, patch: Partial<Comp>) {
    setVariants((prev) => prev.map((v, idx) => idx === i ? { ...v, components: v.components.map((c, cj) => cj === ci ? { ...c, ...patch } : c) } : v));
  }

  async function save() {
    if (!name.trim()) { onError('A product name is required.'); return; }
    setSaving(true); onError('');
    try {
      const res = await fetch('/api/admin/trial-products', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: initial.id || undefined,
          name: name.trim(),
          category: category.trim() || 'Uncategorised',
          variants: variants
            .filter((v) => String(v.dosage).trim() || num(v.price) || num(v.stock))
            .map((v) => ({
              dosage: String(v.dosage).trim(), price: num(v.price), stock: num(v.stock),
              rawCost: num(v.rawCost), shipping: num(v.shipping),
              components: v.components.filter((c) => c.label || c.amount).map((c) => ({ label: c.label, amount: num(c.amount) })),
            })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { onError(data.error || 'Could not save.'); return; }
      onSaved();
    } catch { onError('Could not save.'); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/40 flex justify-end" onClick={onClose}>
      <div className="h-full w-full max-w-2xl bg-white shadow-2xl flex flex-col overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 sticky top-0 bg-white">
          <h2 className="text-sm font-semibold text-stone-800">{initial.id ? 'Edit trial product' : 'New trial product'}</h2>
          <button onClick={onClose} className="text-xs text-stone-500 hover:text-stone-700">Close</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-xs text-stone-500">
            {initial.id
              ? `Product code: ${trialRoyalMailRef(initial.id, initial.productCode)}. This code cannot be changed.`
              : 'A permanent Product code is assigned when you save this new Trial product.'}
          </p>
          <div className="flex flex-wrap gap-4">
            <label className="text-[10px] text-stone-500">Product name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Trial product name" className="block w-64 border border-stone-200 px-2 py-1.5 text-sm mt-0.5" />
            </label>
            <label className="text-[10px] text-stone-500">Category
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Serums" className="block w-48 border border-stone-200 px-2 py-1.5 text-sm mt-0.5" />
            </label>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider text-stone-500 mb-2">Sizes</p>
            <div className="space-y-4">
              {variants.map((v, i) => (
                <div key={i} className="border border-stone-200 p-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="text-[10px] text-stone-500">Size<input value={v.dosage} onChange={(e) => setV(i, { dosage: e.target.value })} placeholder="30ml" className="block w-20 border border-stone-200 px-2 py-1 text-xs mt-0.5" /></label>
                    <label className="text-[10px] text-stone-500">Sale £<input inputMode="decimal" value={v.price} onChange={(e) => setV(i, { price: e.target.value })} className="block w-20 border border-stone-200 px-2 py-1 text-xs tabular-nums mt-0.5" /></label>
                    <label className="text-[10px] text-stone-500">Stock<input inputMode="numeric" value={v.stock} onChange={(e) => setV(i, { stock: e.target.value })} className="block w-16 border border-stone-200 px-2 py-1 text-xs tabular-nums mt-0.5" /></label>
                    <label className="text-[10px] text-stone-500">Raw cost £<input inputMode="decimal" value={v.rawCost} onChange={(e) => setV(i, { rawCost: e.target.value })} className="block w-20 border border-stone-200 px-2 py-1 text-xs tabular-nums mt-0.5" /></label>
                    <label className="text-[10px] text-stone-500">Shipping/unit £<input inputMode="decimal" value={v.shipping} onChange={(e) => setV(i, { shipping: e.target.value })} className="block w-20 border border-stone-200 px-2 py-1 text-xs tabular-nums mt-0.5" /></label>
                    {variants.length > 1 && <button onClick={() => setVariants((p) => p.filter((_, idx) => idx !== i))} className="text-[10px] text-stone-500 hover:text-red-500 pb-1">remove</button>}
                  </div>
                  <div className="flex flex-wrap gap-3 mt-2">
                    {v.components.map((c, ci) => (
                      <div key={ci} className="flex items-end gap-1">
                        <label className="text-[10px] text-stone-500">Cost name<input value={c.label} placeholder={ci === 0 ? 'Box' : ci === 1 ? 'Label' : 'name'} onChange={(e) => setComp(i, ci, { label: e.target.value })} className="block w-24 border border-stone-200 px-2 py-1 text-xs mt-0.5" /></label>
                        <label className="text-[10px] text-stone-500">£<input inputMode="decimal" value={c.amount} onChange={(e) => setComp(i, ci, { amount: e.target.value })} className="block w-16 border border-stone-200 px-2 py-1 text-xs tabular-nums mt-0.5" /></label>
                      </div>
                    ))}
                    <div className="text-[10px] text-stone-500 self-end pb-1">Total cost <span className="text-xs tabular-nums font-semibold text-stone-800">{money(totalCost(v))}</span></div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setVariants((p) => [...p, blankVariant()])} className="text-[10px] uppercase tracking-wider text-stone-500 hover:text-gold-700 mt-3">+ Add size</button>
          </div>
        </div>
        <div className="mt-auto px-6 py-4 border-t border-stone-200 sticky bottom-0 bg-white flex gap-3">
          <button onClick={save} disabled={saving} className="text-[10px] uppercase tracking-wider bg-gold-700 text-white px-5 py-2 hover:bg-gold-800 disabled:opacity-50">{saving ? 'Saving…' : 'Save trial product'}</button>
          <button onClick={onClose} className="text-[10px] uppercase tracking-wider text-stone-500 hover:text-stone-700 px-3 py-2">Cancel</button>
        </div>
      </div>
    </div>
  );
}
