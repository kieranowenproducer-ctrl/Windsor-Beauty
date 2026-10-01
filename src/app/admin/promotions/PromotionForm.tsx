'use client';

import type { FormEvent } from 'react';
import type { Product } from '@/data/products';
import { KNOWN_PROMOTION_ROUTES } from '@/lib/promotionRoutes';
import MultiImageUploadField from '@/components/admin/MultiImageUploadField';
import { SELECT_CLASS, INPUT_CLASS, EMPTY_FORM } from './promotionRuleForms';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  form: typeof EMPTY_FORM;
  setForm: (update: (prev: typeof EMPTY_FORM) => typeof EMPTY_FORM) => void;
  editingId: number | null;
  handleSubmit: (e: FormEvent) => void;
  cancelEdit: () => void;
  saveStatus: 'idle' | 'loading' | 'error';
  saveMessage: string;
  allCategories: string[];
  discountProductSearch: string;
  setDiscountProductSearch: (value: string) => void;
  discountProductCategoryFilter: string;
  setDiscountProductCategoryFilter: (value: string) => void;
  discountFilteredProducts: Product[];
  discountPreviewProducts: Product[];
  handleUploadingChange: (uploading: boolean) => void;
  uploadingCount: number;
}

export default function PromotionForm({
  form, setForm, editingId, handleSubmit, cancelEdit, saveStatus, saveMessage,
  allCategories, discountProductSearch, setDiscountProductSearch,
  discountProductCategoryFilter, setDiscountProductCategoryFilter,
  discountFilteredProducts, discountPreviewProducts,
  handleUploadingChange, uploadingCount,
}: Props) {
  return (
    <>
          {/* Create / edit form */}
          <div className="bg-white border border-stone-200 p-6 mb-8">
            <h2 className="text-sm font-semibold text-stone-800 mb-2">
              {editingId ? 'Edit Promotion' : 'Create a New Promotion'}
            </h2>
            <p className="text-xs text-stone-500 mb-4 leading-relaxed">
              Leave the start or end date blank for no limit on that side. The button is optional, leave both fields
              blank to show a banner with no call-to-action.
            </p>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Title</span>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Summer Sale"
                  required
                  className="border border-stone-200 px-3 py-2.5 text-xs focus:outline-none focus:border-gold-400 transition-colors"
                />
              </label>
              <label className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Description</span>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Save 15% across the entire range for a limited time."
                  rows={3}
                  required
                  className="border border-stone-200 px-3 py-2.5 text-xs leading-relaxed focus:outline-none focus:border-gold-400 transition-colors"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Button Text (optional)</span>
                <input
                  type="text"
                  value={form.buttonText}
                  onChange={(e) => setForm(prev => ({ ...prev, buttonText: e.target.value }))}
                  placeholder="Shop Now"
                  className="border border-stone-200 px-3 py-2.5 text-xs focus:outline-none focus:border-gold-400 transition-colors"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Button Link (optional)</span>
                <div className="relative">
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) setForm(prev => ({ ...prev, buttonLink: e.target.value }));
                    }}
                    className="w-full appearance-none border border-stone-200 bg-white px-3 py-2.5 text-[10px] tracking-[0.1em] uppercase text-stone-500 focus:outline-none focus:border-gold-400 transition-colors cursor-pointer"
                  >
                    <option value="">Quick pick a page&hellip;</option>
                    {KNOWN_PROMOTION_ROUTES.map(route => (
                      <option key={route.value} value={route.value}>{route.label}</option>
                    ))}
                  </select>
                </div>
                <input
                  type="text"
                  value={form.buttonLink}
                  onChange={(e) => setForm(prev => ({ ...prev, buttonLink: e.target.value }))}
                  placeholder="/shop"
                  className="border border-stone-200 px-3 py-2.5 text-xs focus:outline-none focus:border-gold-400 transition-colors"
                />
                <span className="text-[10px] text-stone-500 normal-case tracking-normal">
                  Must start with &ldquo;/&rdquo; (a page on this site) or be a full https:// link. Leave blank to
                  send shoppers to the Promotion page.
                </span>
              </label>
              <label className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Promotion Type</span>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-xs text-stone-600 font-normal normal-case tracking-normal">
                    <input
                      type="radio"
                      name="promotionType"
                      checked={form.promotionType === 'informational'}
                      onChange={() => setForm(prev => ({ ...prev, promotionType: 'informational' }))}
                      className="accent-gold-500"
                    />
                    Manual promotion - own images, custom text
                  </label>
                  <label className="flex items-center gap-2 text-xs text-stone-600 font-normal normal-case tracking-normal">
                    <input
                      type="radio"
                      name="promotionType"
                      checked={form.promotionType === 'code'}
                      onChange={() => setForm(prev => ({ ...prev, promotionType: 'code' }))}
                      className="accent-gold-500"
                    />
                    Discount code - customer enters a code at checkout
                  </label>
                  <label className="flex items-center gap-2 text-xs text-stone-600 font-normal normal-case tracking-normal">
                    <input
                      type="radio"
                      name="promotionType"
                      checked={form.promotionType === 'percentage'}
                      onChange={() => setForm(prev => ({ ...prev, promotionType: 'percentage' }))}
                      className="accent-gold-500"
                    />
                    Percentage discount - automatic, linked to products
                  </label>
                </div>
              </label>

              {form.promotionType === 'percentage' && (
                <div className="sm:col-span-2 border border-gold-100 bg-gold-50/30 p-4 flex flex-col gap-4">
                  <p className="text-[10px] text-stone-500 normal-case tracking-normal leading-relaxed">
                    Automatically reduces the price of the selected products/categories across the whole site
                    (shop, product pages, basket, checkout) and shows them on the Special Offers page with a
                    discount badge - no code for customers to enter. Only one percentage discount promotion can
                    be active at a time; activating this one switches any other off.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Percentage Off</span>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={form.discountPercent}
                        onChange={(e) => setForm(prev => ({ ...prev, discountPercent: e.target.value }))}
                        className={`w-28 ${INPUT_CLASS}`}
                      />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Applies To</span>
                      <select
                        value={form.discountScopeType}
                        onChange={(e) => setForm(prev => ({ ...prev, discountScopeType: e.target.value as 'all' | 'category' | 'product' }))}
                        className={SELECT_CLASS}
                      >
                        <option value="all">All products</option>
                        <option value="category">Specific categories</option>
                        <option value="product">Specific products</option>
                      </select>
                    </label>
                  </div>

                  {form.discountScopeType === 'category' && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Categories</span>
                      <div className="flex flex-wrap gap-x-4 gap-y-2 border border-stone-200 bg-white p-3 max-h-40 overflow-y-auto">
                        {allCategories.map((category) => (
                          <label key={category} className="flex items-center gap-1.5 text-xs text-stone-600 font-normal normal-case tracking-normal">
                            <input
                              type="checkbox"
                              checked={form.discountScopeCategories.includes(category)}
                              onChange={(e) => setForm(prev => ({
                                ...prev,
                                discountScopeCategories: e.target.checked
                                  ? [...prev.discountScopeCategories, category]
                                  : prev.discountScopeCategories.filter((c) => c !== category),
                              }))}
                              className="accent-gold-500"
                            />
                            {category}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {form.discountScopeType === 'product' && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Products</span>
                      <div className="flex flex-wrap gap-2">
                        <select
                          value={discountProductCategoryFilter}
                          onChange={(e) => setDiscountProductCategoryFilter(e.target.value)}
                          className={SELECT_CLASS}
                        >
                          <option value="All">Filter by category…</option>
                          {allCategories.map((category) => (
                            <option key={category} value={category}>{category}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={discountProductSearch}
                          onChange={(e) => setDiscountProductSearch(e.target.value)}
                          placeholder="Search products by name…"
                          className={`flex-1 min-w-[160px] ${INPUT_CLASS}`}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5 border border-stone-200 bg-white p-3 max-h-48 overflow-y-auto">
                        {discountFilteredProducts.length === 0 ? (
                          <p className="text-[10px] text-stone-500 py-1">No products match this filter.</p>
                        ) : discountFilteredProducts.map((product) => (
                          <label key={product.slug} className="flex items-center gap-1.5 text-xs text-stone-600 font-normal normal-case tracking-normal">
                            <input
                              type="checkbox"
                              checked={form.discountScopeProductSlugs.includes(product.slug)}
                              onChange={(e) => setForm(prev => ({
                                ...prev,
                                discountScopeProductSlugs: e.target.checked
                                  ? [...prev.discountScopeProductSlugs, product.slug]
                                  : prev.discountScopeProductSlugs.filter((s) => s !== product.slug),
                              }))}
                              className="accent-gold-500"
                            />
                            {product.name}
                          </label>
                        ))}
                      </div>
                      {form.discountScopeProductSlugs.length > 0 && (
                        <p className="text-[10px] text-stone-500 normal-case tracking-normal">
                          {form.discountScopeProductSlugs.length} product{form.discountScopeProductSlugs.length === 1 ? '' : 's'} selected
                          (selections are kept even when the filter above hides them).
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">
                      Preview - {discountPreviewProducts.length} product{discountPreviewProducts.length === 1 ? '' : 's'} included
                    </span>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                      {discountPreviewProducts.length === 0 ? (
                        <p className="text-[10px] text-stone-500">No products match this selection yet.</p>
                      ) : discountPreviewProducts.map((p) => (
                        <span key={p.slug} className="text-[10px] text-stone-500 bg-white border border-stone-200 px-2 py-1">
                          {p.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="sm:col-span-2">
                <MultiImageUploadField
                  value={form.imageUrls}
                  onChange={urls => setForm(prev => ({ ...prev, imageUrls: urls }))}
                  endpoint="/api/admin/promotions/upload-image"
                  label={form.promotionType === 'percentage' ? 'Marketing Images (optional)' : 'Promotion Images (optional)'}
                  onUploadingChange={handleUploadingChange}
                />
                <p className="text-[10px] text-stone-500 normal-case tracking-normal mt-1.5">
                  {form.promotionType === 'percentage'
                    ? 'Optional - the linked products already show on the Special Offers page automatically. Add an image here only if you also want a marketing banner above them.'
                    : 'Add one image, or several for a swipeable carousel on the Special Offers page. Drag isn’t supported - use Up/Down to reorder.'}
                </p>
              </div>
              {form.promotionType !== 'percentage' && (
                <label className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">
                    Discount Code {form.promotionType === 'code' ? '(required)' : '(optional)'}
                  </span>
                  <input
                    type="text"
                    value={form.discountCode}
                    onChange={(e) => setForm(prev => ({ ...prev, discountCode: e.target.value.toUpperCase() }))}
                    placeholder="SUMMER15"
                    className="border border-stone-200 px-3 py-2.5 text-xs uppercase tracking-wider focus:outline-none focus:border-gold-400 transition-colors"
                  />
                  <span className="text-[10px] text-stone-500 normal-case tracking-normal">
                    Shown on the dedicated /promotion page for customers to copy and use at checkout.
                  </span>
                </label>
              )}
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Start Date (optional)</span>
                <input
                  type="datetime-local"
                  value={form.startDate}
                  onChange={(e) => setForm(prev => ({ ...prev, startDate: e.target.value }))}
                  className="border border-stone-200 px-3 py-2.5 text-xs focus:outline-none focus:border-gold-400 transition-colors"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">End Date (optional)</span>
                <input
                  type="datetime-local"
                  value={form.endDate}
                  onChange={(e) => setForm(prev => ({ ...prev, endDate: e.target.value }))}
                  className="border border-stone-200 px-3 py-2.5 text-xs focus:outline-none focus:border-gold-400 transition-colors"
                />
              </label>
              <label className="flex items-center gap-2 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm(prev => ({ ...prev, active: e.target.checked }))}
                  className="accent-gold-500"
                />
                <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Active</span>
              </label>
              <div className="sm:col-span-2 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={saveStatus === 'loading' || uploadingCount > 0}
                  className="bg-gold-700 text-white text-[10px] tracking-[0.18em] uppercase px-6 py-3 hover:bg-gold-800 transition-colors disabled:opacity-50"
                >
                  {saveStatus === 'loading' ? 'Saving…' : uploadingCount > 0 ? 'Uploading…' : editingId ? 'Update Promotion' : 'Create Promotion'}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-stone-600 transition-colors"
                  >
                    Cancel
                  </button>
                )}
                {saveMessage && (
                  <p className={`text-xs ${saveStatus === 'error' ? 'text-red-600' : 'text-stone-600'}`}>{saveMessage}</p>
                )}
              </div>
            </form>
          </div>
    </>
  );
}
