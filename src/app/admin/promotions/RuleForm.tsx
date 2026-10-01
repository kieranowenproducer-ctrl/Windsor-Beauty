'use client';

import type { FormEvent } from 'react';
import { sortVariantsByStrength, type Product } from '@/data/products';
import SelectorFields from './SelectorFields';
import { SELECT_CLASS, INPUT_CLASS, type RuleFormState, type BundleItemFormState } from './promotionRuleForms';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  ruleForm: RuleFormState;
  setRuleForm: (update: (prev: RuleFormState) => RuleFormState) => void;
  setRuleType: (type: RuleFormState['type']) => void;
  editingRuleId: number | null;
  handleRuleSubmit: (e: FormEvent) => void;
  cancelRuleEdit: () => void;
  ruleSaveStatus: 'idle' | 'loading' | 'error';
  ruleSaveMessage: string;
  rulesLoadError: string;
  addBundleItem: () => void;
  removeBundleItem: (index: number) => void;
  updateBundleItem: (index: number, patch: Partial<BundleItemFormState>) => void;
  products: Product[];
  allCategories: string[];
}

export default function RuleForm({
  ruleForm, setRuleForm, setRuleType, editingRuleId, handleRuleSubmit, cancelRuleEdit,
  ruleSaveStatus, ruleSaveMessage, rulesLoadError,
  addBundleItem, removeBundleItem, updateBundleItem, products, allCategories,
}: Props) {
  return (
    <>
          {/* Automatic Promotion Rules */}
          <h2 className="text-base font-semibold text-stone-800 mb-1 mt-12">Automatic Promotion Rules</h2>
          <p className="text-xs text-stone-500 mb-4">
            Buy-one-get-one offers, bundle pricing, and spend-and-save rewards apply automatically to every
            matching order, no code required. They apply before any manual discount code.
          </p>

          {rulesLoadError && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-3 mb-6">
              {rulesLoadError}
            </div>
          )}

          <div className="bg-white border border-stone-200 p-6 mb-8">
            <h2 className="text-sm font-semibold text-stone-800 mb-2">
              {editingRuleId ? 'Edit Automatic Promotion Rule' : 'Create an Automatic Promotion Rule'}
            </h2>
            <p className="text-xs text-stone-500 mb-4 leading-relaxed">
              Pick a rule type, then fill in the fields below. Use Priority to control the order rules are
              evaluated in when several could apply to the same order. Lower priority numbers run first.
            </p>
            <form onSubmit={handleRuleSubmit} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Name</span>
                  <input
                    type="text"
                    value={ruleForm.name}
                    onChange={(e) => setRuleForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Buy 2 get 1 free: BPC-157"
                    required
                    className={INPUT_CLASS}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Rule Type</span>
                  <select
                    value={ruleForm.type}
                    onChange={(e) => setRuleType(e.target.value as RuleFormState['type'])}
                    className={SELECT_CLASS}
                  >
                    <option value="bogo">Buy One Get One (BOGO)</option>
                    <option value="bundle">Bundle Pricing</option>
                    <option value="spend_threshold">Spend Threshold</option>
                  </select>
                </label>
              </div>

              {ruleForm.type === 'bogo' && (
                <div className="flex flex-col gap-4 border border-stone-100 bg-stone-50/50 p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-end">
                    <SelectorFields
                      label="Buy"
                      value={ruleForm.buySelector}
                      onChange={(s) => setRuleForm(prev => ({ ...prev, buySelector: s }))}
                      products={products}
                      categories={allCategories}
                    />
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Quantity</span>
                      <input
                        type="number"
                        min={1}
                        value={ruleForm.buyQuantity}
                        onChange={(e) => setRuleForm(prev => ({ ...prev, buyQuantity: e.target.value }))}
                        className={`w-24 ${INPUT_CLASS}`}
                      />
                    </label>
                  </div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={ruleForm.sameAsBuy}
                      onChange={(e) => setRuleForm(prev => ({ ...prev, sameAsBuy: e.target.checked }))}
                      className="accent-gold-500"
                    />
                    <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">
                      &ldquo;Get&rdquo; is the same product (classic BOGO)
                    </span>
                  </label>
                  {!ruleForm.sameAsBuy && (
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-end">
                      <SelectorFields
                        label="Get"
                        value={ruleForm.getSelector}
                        onChange={(s) => setRuleForm(prev => ({ ...prev, getSelector: s }))}
                        products={products}
                        categories={allCategories}
                      />
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Quantity</span>
                        <input
                          type="number"
                          min={1}
                          value={ruleForm.getQuantity}
                          onChange={(e) => setRuleForm(prev => ({ ...prev, getQuantity: e.target.value }))}
                          className={`w-24 ${INPUT_CLASS}`}
                        />
                      </label>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Reward</span>
                      <select
                        value={ruleForm.bogoRewardType}
                        onChange={(e) => setRuleForm(prev => ({ ...prev, bogoRewardType: e.target.value as 'free' | 'percent_off' }))}
                        className={SELECT_CLASS}
                      >
                        <option value="free">Free</option>
                        <option value="percent_off">% off</option>
                      </select>
                    </label>
                    {ruleForm.bogoRewardType === 'percent_off' && (
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Reward Percent</span>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={ruleForm.bogoRewardPercent}
                          onChange={(e) => setRuleForm(prev => ({ ...prev, bogoRewardPercent: e.target.value }))}
                          className={INPUT_CLASS}
                        />
                      </label>
                    )}
                  </div>
                </div>
              )}

              {ruleForm.type === 'bundle' && (
                <div className="flex flex-col gap-4 border border-stone-100 bg-stone-50/50 p-4">
                  <div className="flex flex-col gap-3">
                    {ruleForm.bundleItems.map((item, idx) => (
                      <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-end">
                        <label className="flex flex-col gap-1.5">
                          <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Product {idx + 1}</span>
                          <select
                            value={item.slug}
                            onChange={(e) => updateBundleItem(idx, { slug: e.target.value, dosage: '' })}
                            className={SELECT_CLASS}
                          >
                            <option value="">Select a product…</option>
                            {products.map((product) => (
                              <option key={product.slug} value={product.slug}>{product.name}</option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1.5">
                          <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Variant</span>
                          <select
                            value={item.dosage}
                            onChange={(e) => updateBundleItem(idx, { dosage: e.target.value })}
                            className={SELECT_CLASS}
                          >
                            <option value="">Any variant</option>
                            {(() => {
                              const p = products.find(pr => pr.slug === item.slug);
                              return p ? sortVariantsByStrength(p.variants).map((variant) => (
                                <option key={variant.dosage} value={variant.dosage}>{variant.dosage}</option>
                              )) : null;
                            })()}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1.5">
                          <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Qty</span>
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => updateBundleItem(idx, { quantity: e.target.value })}
                            className={`w-20 ${INPUT_CLASS}`}
                          />
                        </label>
                        {ruleForm.bundleItems.length > 2 && (
                          <button
                            type="button"
                            onClick={() => removeBundleItem(idx)}
                            className="text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-red-500 transition-colors pb-2.5"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addBundleItem}
                      className="text-[10px] tracking-[0.15em] uppercase text-gold-700 hover:text-gold-700 transition-colors self-start"
                    >
                      + Add Item
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Reward</span>
                      <select
                        value={ruleForm.bundleRewardType}
                        onChange={(e) => setRuleForm(prev => ({ ...prev, bundleRewardType: e.target.value as 'bundle_price' | 'percent_off' }))}
                        className={SELECT_CLASS}
                      >
                        <option value="bundle_price">Fixed bundle price</option>
                        <option value="percent_off">% off</option>
                      </select>
                    </label>
                    {ruleForm.bundleRewardType === 'bundle_price' ? (
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Bundle Price (£)</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={ruleForm.bundlePrice}
                          onChange={(e) => setRuleForm(prev => ({ ...prev, bundlePrice: e.target.value }))}
                          className={INPUT_CLASS}
                        />
                      </label>
                    ) : (
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Reward Percent</span>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={ruleForm.bundleRewardPercent}
                          onChange={(e) => setRuleForm(prev => ({ ...prev, bundleRewardPercent: e.target.value }))}
                          className={INPUT_CLASS}
                        />
                      </label>
                    )}
                  </div>
                </div>
              )}

              {ruleForm.type === 'spend_threshold' && (
                <div className="flex flex-col gap-4 border border-stone-100 bg-stone-50/50 p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Minimum Spend (£)</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={ruleForm.minSpend}
                        onChange={(e) => setRuleForm(prev => ({ ...prev, minSpend: e.target.value }))}
                        className={INPUT_CLASS}
                      />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Scope</span>
                      <select
                        value={ruleForm.spendScopeType}
                        onChange={(e) => setRuleForm(prev => ({ ...prev, spendScopeType: e.target.value as 'all' | 'category' }))}
                        className={SELECT_CLASS}
                      >
                        <option value="all">Whole order</option>
                        <option value="category">Category</option>
                      </select>
                    </label>
                  </div>
                  {ruleForm.spendScopeType === 'category' && (
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Category</span>
                      <select
                        value={ruleForm.spendScopeCategory}
                        onChange={(e) => setRuleForm(prev => ({ ...prev, spendScopeCategory: e.target.value }))}
                        className={SELECT_CLASS}
                      >
                        <option value="">Select a category…</option>
                        {allCategories.map((category) => (
                          <option key={category} value={category}>{category}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Reward</span>
                    <select
                      value={ruleForm.spendRewardType}
                      onChange={(e) => setRuleForm(prev => ({ ...prev, spendRewardType: e.target.value as 'percent_off' | 'free_item' }))}
                      className={SELECT_CLASS}
                    >
                      <option value="percent_off">% off order</option>
                      <option value="free_item">Free item</option>
                    </select>
                  </label>
                  {ruleForm.spendRewardType === 'percent_off' ? (
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Reward Percent</span>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={ruleForm.spendRewardPercent}
                        onChange={(e) => setRuleForm(prev => ({ ...prev, spendRewardPercent: e.target.value }))}
                        className={INPUT_CLASS}
                      />
                    </label>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-4 items-end">
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Free Item</span>
                        <select
                          value={ruleForm.freeItemSlug}
                          onChange={(e) => setRuleForm(prev => ({ ...prev, freeItemSlug: e.target.value, freeItemDosage: '' }))}
                          className={SELECT_CLASS}
                        >
                          <option value="">Select a product…</option>
                          {products.map((product) => (
                            <option key={product.slug} value={product.slug}>{product.name}</option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Variant</span>
                        <select
                          value={ruleForm.freeItemDosage}
                          onChange={(e) => setRuleForm(prev => ({ ...prev, freeItemDosage: e.target.value }))}
                          className={SELECT_CLASS}
                        >
                          <option value="">Default variant</option>
                          {(() => {
                            const p = products.find(pr => pr.slug === ruleForm.freeItemSlug);
                            return p ? sortVariantsByStrength(p.variants).map((variant) => (
                              <option key={variant.dosage} value={variant.dosage}>{variant.dosage}</option>
                            )) : null;
                          })()}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Qty</span>
                        <input
                          type="number"
                          min={1}
                          value={ruleForm.freeItemQuantity}
                          onChange={(e) => setRuleForm(prev => ({ ...prev, freeItemQuantity: e.target.value }))}
                          className={`w-20 ${INPUT_CLASS}`}
                        />
                      </label>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Start Date (optional)</span>
                  <input
                    type="datetime-local"
                    value={ruleForm.startDate}
                    onChange={(e) => setRuleForm(prev => ({ ...prev, startDate: e.target.value }))}
                    className={INPUT_CLASS}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">End Date (optional)</span>
                  <input
                    type="datetime-local"
                    value={ruleForm.endDate}
                    onChange={(e) => setRuleForm(prev => ({ ...prev, endDate: e.target.value }))}
                    className={INPUT_CLASS}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Priority</span>
                  <input
                    type="number"
                    value={ruleForm.priority}
                    onChange={(e) => setRuleForm(prev => ({ ...prev, priority: e.target.value }))}
                    className={INPUT_CLASS}
                  />
                  <span className="text-[10px] text-stone-500 normal-case tracking-normal">Lower runs first.</span>
                </label>
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={ruleForm.active}
                  onChange={(e) => setRuleForm(prev => ({ ...prev, active: e.target.checked }))}
                  className="accent-gold-500"
                />
                <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Active</span>
              </label>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={ruleSaveStatus === 'loading'}
                  className="bg-gold-700 text-white text-[10px] tracking-[0.18em] uppercase px-6 py-3 hover:bg-gold-800 transition-colors disabled:opacity-50"
                >
                  {ruleSaveStatus === 'loading' ? 'Saving…' : editingRuleId ? 'Update Rule' : 'Create Rule'}
                </button>
                {editingRuleId && (
                  <button
                    type="button"
                    onClick={cancelRuleEdit}
                    className="text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-stone-600 transition-colors"
                  >
                    Cancel
                  </button>
                )}
                {ruleSaveMessage && (
                  <p className={`text-xs ${ruleSaveStatus === 'error' ? 'text-red-600' : 'text-stone-600'}`}>{ruleSaveMessage}</p>
                )}
              </div>
            </form>
          </div>
    </>
  );
}
