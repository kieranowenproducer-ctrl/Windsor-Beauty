'use client';

import type { UpsellRule, UpsellSettings, ManualOverride } from './upsellTypes';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  rules: UpsellRule[] | null;
  settings: UpsellSettings;
  search: string;
  setSearch: (value: string) => void;
  filteredGroups: { trigger: string; rules: UpsellRule[] }[];
  totalProducts: number;
  productLabel: (slug: string) => string;
  manualOverrideMap: Map<string, ManualOverride>;
  selectTriggerProduct: (slug: string) => void;
  handleDelete: (id: number) => void;
  deletingId: number | null;
}

export default function ImportedRulesSummary({
  rules, settings, search, setSearch, filteredGroups, totalProducts, productLabel, manualOverrideMap, selectTriggerProduct, handleDelete, deletingId,
}: Props) {
  return (
    <>
          {/* ─── CSV-imported rules summary ────────────────────────────── */}
          <div className="bg-white border border-stone-200">
            <div className="px-6 py-4 border-b border-stone-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-stone-800">
                  CSV-Imported Rules {rules ? `(${rules.length})` : ''}
                </h2>
                <p className="text-[10px] text-stone-500 mt-0.5">
                  {totalProducts} product{totalProducts !== 1 ? 's' : ''} referenced
                  {settings.lastImport && (
                    <> · last import {new Date(settings.lastImport.at).toLocaleString('en-GB')} ({settings.lastImport.mode}, {settings.lastImport.totalRules} rules)</>
                  )}
                </p>
              </div>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by product name or handle…"
                className="border border-stone-200 px-3 py-2 text-xs focus:outline-none focus:border-gold-400 transition-colors sm:w-64"
              />
            </div>

            <div className="p-6">
              {rules && rules.length === 0 && (
                <p className="text-xs text-stone-500 text-center py-8">No CSV-imported rules yet. Import a CSV above, or use the manual editor - either way works.</p>
              )}
              {rules && rules.length > 0 && filteredGroups.length === 0 && (
                <p className="text-xs text-stone-500 text-center py-8">No relationships match &ldquo;{search}&rdquo;.</p>
              )}
              <div className="space-y-6">
                {filteredGroups.map(group => {
                  const overridden = manualOverrideMap.has(group.trigger);
                  return (
                    <div key={group.trigger}>
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <p className="text-xs font-semibold text-stone-700">{productLabel(group.trigger)}</p>
                        {overridden && (
                          <span className="px-1.5 py-0.5 text-[8px] tracking-wider uppercase bg-gold-100 text-gold-700">Manual override active - these rules are unused</span>
                        )}
                        <button
                          type="button"
                          onClick={() => selectTriggerProduct(group.trigger)}
                          className="text-[9px] tracking-wider uppercase text-gold-700 hover:text-gold-700 transition-colors"
                        >
                          Edit Manually
                        </button>
                      </div>
                      <ul className={`space-y-1.5 pl-4 border-l border-gold-100 ${overridden ? 'opacity-50' : ''}`}>
                        {group.rules.map(rule => (
                          <li key={rule.id} className="flex items-start justify-between gap-3 text-xs text-stone-500">
                            <div className="flex-1">
                              <span className="text-gold-700 mr-1.5">&rarr;</span>
                              {productLabel(rule.upsell_handle)}
                              {!rule.active && (
                                <span className="ml-2 inline-block px-1.5 py-0.5 text-[9px] tracking-wider uppercase bg-stone-100 text-stone-500">Inactive</span>
                              )}
                              {rule.custom_message && (
                                <p className="text-[10px] text-stone-500 italic mt-0.5">&ldquo;{rule.custom_message}&rdquo;</p>
                              )}
                            </div>
                            <button
                              onClick={() => handleDelete(rule.id)}
                              disabled={deletingId === rule.id}
                              className="text-[9px] tracking-wider text-stone-300 hover:text-red-400 transition-colors uppercase shrink-0 disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
    </>
  );
}
