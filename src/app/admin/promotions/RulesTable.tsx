'use client';

import { RULE_TYPE_LABELS, type PromotionRuleRow } from './promotionRuleForms';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  rules: PromotionRuleRow[] | null;
  loadRules: () => void;
  startRuleEdit: (row: PromotionRuleRow) => void;
  toggleRuleActive: (row: PromotionRuleRow) => void;
  handleDeleteRule: (row: PromotionRuleRow) => void;
  ruleDeleteId: number | null;
  ruleDeleteConfirm: number | null;
  setRuleDeleteConfirm: (value: number | null) => void;
  summarizeRule: (row: PromotionRuleRow) => string;
  statusFor: (row: { active: boolean; start_date: string | null; end_date: string | null }) => { label: string; tone: string };
}

export default function RulesTable({
  rules, loadRules, startRuleEdit, toggleRuleActive, handleDeleteRule,
  ruleDeleteId, ruleDeleteConfirm, setRuleDeleteConfirm, summarizeRule, statusFor,
}: Props) {
  return (
    <>
          {/* Rules table */}
          <div className="bg-white border border-stone-200">
            <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-stone-800">
                All Automatic Rules {rules ? `(${rules.length.toLocaleString()})` : ''}
              </h2>
              <button onClick={loadRules} className="text-[10px] tracking-[0.15em] uppercase text-gold-700 hover:text-gold-700 transition-colors">
                Refresh
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[9px] tracking-[0.15em] uppercase text-stone-500 border-b border-stone-100">
                    <th className="px-6 py-3">Name</th>
                    <th className="px-6 py-3">Type</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Priority</th>
                    <th className="px-6 py-3">Summary</th>
                    <th className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {rules && rules.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-stone-500">
                        No automatic promotion rules yet. Create one using the form above.
                      </td>
                    </tr>
                  )}
                  {rules?.map((row) => {
                    const status = statusFor(row);
                    return (
                      <tr key={row.id} className="border-b border-stone-50">
                        <td className="px-6 py-3 text-stone-700 font-medium">{row.name}</td>
                        <td className="px-6 py-3 text-stone-500">{RULE_TYPE_LABELS[row.type] ?? row.type}</td>
                        <td className="px-6 py-3">
                          <span className={`inline-block px-2 py-0.5 text-[10px] tracking-[0.1em] uppercase ${status.tone}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-stone-500">{row.priority}</td>
                        <td className="px-6 py-3 text-stone-500 max-w-xs">{summarizeRule(row)}</td>
                        <td className="px-6 py-3 text-right">
                          <div className="flex items-center gap-3 justify-end">
                            <button
                              onClick={() => toggleRuleActive(row)}
                              className={`text-[10px] tracking-[0.15em] uppercase transition-colors ${
                                row.active ? 'text-stone-500 hover:text-red-400' : 'text-gold-700 hover:text-gold-700'
                              }`}
                            >
                              {row.active ? 'Deactivate' : 'Activate'}
                            </button>
                            <button
                              onClick={() => startRuleEdit(row)}
                              className="text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-gold-700 transition-colors"
                            >
                              Edit
                            </button>
                            {ruleDeleteConfirm === row.id ? (
                              <span className="flex items-center gap-2">
                                <span className="text-[10px] text-red-500">Delete permanently?</span>
                                <button
                                  onClick={() => handleDeleteRule(row)}
                                  disabled={ruleDeleteId === row.id}
                                  className="text-[10px] tracking-[0.15em] uppercase text-red-500 hover:text-red-600 transition-colors disabled:opacity-50"
                                >
                                  {ruleDeleteId === row.id ? 'Deleting…' : 'Confirm'}
                                </button>
                                <button
                                  onClick={() => setRuleDeleteConfirm(null)}
                                  className="text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-stone-600 transition-colors"
                                >
                                  Cancel
                                </button>
                              </span>
                            ) : (
                              <button
                                onClick={() => setRuleDeleteConfirm(row.id)}
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
