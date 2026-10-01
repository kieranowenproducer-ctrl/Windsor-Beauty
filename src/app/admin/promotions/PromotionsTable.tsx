'use client';

import type { PromotionRow } from './promotionRuleForms';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  promotions: PromotionRow[] | null;
  loadPromotions: () => void;
  startEdit: (row: PromotionRow) => void;
  toggleActive: (row: PromotionRow) => void;
  handleDelete: (row: PromotionRow) => void;
  deleteId: number | null;
  deleteConfirm: number | null;
  setDeleteConfirm: (value: number | null) => void;
  statusFor: (row: { active: boolean; start_date: string | null; end_date: string | null }) => { label: string; tone: string };
  formatDate: (value: string | null) => string;
}

export default function PromotionsTable({
  promotions, loadPromotions, startEdit, toggleActive, handleDelete,
  deleteId, deleteConfirm, setDeleteConfirm, statusFor, formatDate,
}: Props) {
  return (
    <>
          {/* Promotions table */}
          <div className="bg-white border border-stone-200">
            <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-stone-800">
                All Promotions {promotions ? `(${promotions.length.toLocaleString()})` : ''}
              </h2>
              <button onClick={loadPromotions} className="text-[10px] tracking-[0.15em] uppercase text-gold-700 hover:text-gold-700 transition-colors">
                Refresh
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[9px] tracking-[0.15em] uppercase text-stone-500 border-b border-stone-100">
                    <th className="px-6 py-3">Title</th>
                    <th className="px-6 py-3">Type</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Starts</th>
                    <th className="px-6 py-3">Ends</th>
                    <th className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {promotions && promotions.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-stone-500">
                        No promotions yet. Create one using the form above.
                      </td>
                    </tr>
                  )}
                  {promotions?.map((row) => {
                    const status = statusFor(row);
                    return (
                      <tr key={row.id} className="border-b border-stone-50">
                        <td className="px-6 py-3 text-stone-700 font-medium">{row.title}</td>
                        <td className="px-6 py-3 text-stone-500">
                          {row.promotion_type === 'code'
                            ? `Code (${row.discount_code ?? '-'})`
                            : row.promotion_type === 'percentage'
                              ? `Percentage (${row.discount_percent ?? 0}% off)`
                              : 'Manual'}
                        </td>
                        <td className="px-6 py-3">
                          <span className={`inline-block px-2 py-0.5 text-[10px] tracking-[0.1em] uppercase ${status.tone}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-stone-500">{formatDate(row.start_date)}</td>
                        <td className="px-6 py-3 text-stone-500">{formatDate(row.end_date)}</td>
                        <td className="px-6 py-3 text-right">
                          <div className="flex items-center gap-3 justify-end">
                            <button
                              onClick={() => toggleActive(row)}
                              className={`text-[10px] tracking-[0.15em] uppercase transition-colors ${
                                row.active ? 'text-stone-500 hover:text-red-400' : 'text-gold-700 hover:text-gold-700'
                              }`}
                            >
                              {row.active ? 'Deactivate' : 'Activate'}
                            </button>
                            <button
                              onClick={() => startEdit(row)}
                              className="text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-gold-700 transition-colors"
                            >
                              Edit
                            </button>
                            {deleteConfirm === row.id ? (
                              <span className="flex items-center gap-2">
                                <span className="text-[10px] text-red-500">Delete permanently?</span>
                                <button
                                  onClick={() => handleDelete(row)}
                                  disabled={deleteId === row.id}
                                  className="text-[10px] tracking-[0.15em] uppercase text-red-500 hover:text-red-600 transition-colors disabled:opacity-50"
                                >
                                  {deleteId === row.id ? 'Deleting…' : 'Confirm'}
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm(null)}
                                  className="text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-stone-600 transition-colors"
                                >
                                  Cancel
                                </button>
                              </span>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirm(row.id)}
                                className="text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-red-500 transition-colors"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
    </>
  );
}
