'use client';

import type { FormEvent } from 'react';
import { AVAILABILITY_STATUSES, type AvailabilityStatus } from '@/data/products';
import VariantEditor, { type VariantDraft } from '@/components/admin/VariantEditor';
import ShippingFields, { type ShippingDraft } from '@/components/admin/ShippingFields';
import ImageUploadField from '@/components/admin/ImageUploadField';
import MarkdownLiteEditor from '@/components/admin/MarkdownLiteEditor';
import { AVAILABILITY_LABELS } from './productListUtils';
import { slugify, toggleCategoryIn, type AddProductForm } from './productDrafts';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  showAddForm: boolean;
  addForm: AddProductForm;
  setAddForm: (update: (prev: AddProductForm) => AddProductForm) => void;
  setAddSlugTouched: (value: boolean) => void;
  allCategories: string[];
  updateAddName: (name: string) => void;
  updateVariant: (index: number, field: keyof VariantDraft, value: string | boolean | ShippingDraft) => void;
  addVariantRow: () => void;
  removeVariantRow: (index: number) => void;
  handleUploadingChange: (uploading: boolean) => void;
  uploadingCount: number;
  addError: string;
  addSaving: boolean;
  submitAddProduct: (e: FormEvent) => void;
  resetAddForm: () => void;
}

export default function AddProductFormPanel({
  showAddForm, addForm, setAddForm, setAddSlugTouched, allCategories,
  updateAddName, updateVariant, addVariantRow, removeVariantRow,
  handleUploadingChange, uploadingCount, addError, addSaving,
  submitAddProduct, resetAddForm,
}: Props) {
  return (
    <>
          {/* Add product form */}
          {showAddForm && (
            <div className="bg-white border border-gold-200 p-5 mb-6">
              <h2 className="text-sm font-semibold text-stone-700 mb-4">New Product</h2>
              <form onSubmit={submitAddProduct} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[8px] tracking-widest uppercase text-stone-500 mb-1">Name</label>
                    <input
                      value={addForm.name}
                      onChange={e => updateAddName(e.target.value)}
                      className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] tracking-widest uppercase text-stone-500 mb-1">Slug (URL)</label>
                    <input
                      value={addForm.slug}
                      onChange={e => {
                        setAddSlugTouched(true);
                        setAddForm(prev => ({ ...prev, slug: e.target.value }));
                      }}
                      placeholder="auto-generated-from-name"
                      className="w-full border border-stone-200 px-2 py-1.5 text-xs font-mono focus:border-gold-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] tracking-widest uppercase text-stone-500 mb-1">Purity badge (optional)</label>
                    <input
                      value={addForm.purity}
                      onChange={e => setAddForm(prev => ({ ...prev, purity: e.target.value }))}
                      placeholder="e.g. 99%"
                      className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] tracking-widest uppercase text-stone-500 mb-1">Badge (optional)</label>
                    <select
                      value={addForm.badge}
                      onChange={e => setAddForm(prev => ({ ...prev, badge: e.target.value }))}
                      className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none bg-white"
                    >
                      <option value="">- None -</option>
                      <option value="New">New</option>
                      <option value="Popular">Popular</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[8px] tracking-widest uppercase text-stone-500 mb-1">Brand (optional)</label>
                    <input
                      value={addForm.brand}
                      onChange={e => setAddForm(prev => ({ ...prev, brand: e.target.value }))}
                      placeholder="e.g. Windsor Beauty"
                      className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] tracking-widest uppercase text-stone-500 mb-1">Availability</label>
                    <select
                      value={addForm.availability}
                      onChange={e => setAddForm(prev => ({ ...prev, availability: e.target.value as AvailabilityStatus }))}
                      className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none bg-white"
                    >
                      {AVAILABILITY_STATUSES.map(status => (
                        <option key={status} value={status}>{AVAILABILITY_LABELS[status]}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[8px] tracking-widest uppercase text-stone-500 mb-1">Categories</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 border border-stone-200 p-3">
                    {allCategories.map(cat => (
                      <label key={cat} className="flex items-center gap-1.5 text-xs text-stone-600">
                        <input
                          type="checkbox"
                          checked={addForm.categories.includes(cat)}
                          onChange={() => setAddForm(prev => ({ ...prev, categories: toggleCategoryIn(prev.categories, cat) }))}
                          className="accent-gold-500"
                        />
                        {cat}
                      </label>
                    ))}
                  </div>
                </div>

                <ImageUploadField
                  value={addForm.image}
                  onChange={url => setAddForm(prev => ({ ...prev, image: url }))}
                  fallbackHint={addForm.slug ? `Falls back to /images/products/${slugify(addForm.slug)}.jpg when no photo is uploaded.` : 'Upload a photo, or leave blank to use the slug-named file convention.'}
                  onUploadingChange={handleUploadingChange}
                />

                <div>
                  <label className="block text-[8px] tracking-widest uppercase text-stone-500 mb-1">Short Description</label>
                  <input
                    value={addForm.shortDescription}
                    onChange={e => setAddForm(prev => ({ ...prev, shortDescription: e.target.value }))}
                    className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[8px] tracking-widest uppercase text-stone-500 mb-1">Full Description</label>
                  <MarkdownLiteEditor
                    value={addForm.fullDescription}
                    onChange={text => setAddForm(prev => ({ ...prev, fullDescription: text }))}
                    placeholder="Enter the full product description..."
                    height="200px"
                  />
                </div>

                <div>
                  <label className="block text-[8px] tracking-widest uppercase text-stone-500 mb-1">Search Keywords (comma separated, optional)</label>
                  <input
                    value={addForm.keywordsInput}
                    onChange={e => setAddForm(prev => ({ ...prev, keywordsInput: e.target.value }))}
                    placeholder="e.g. mounjaro, monjaro, weight loss jab"
                    className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none"
                  />
                  <p className="text-[9px] text-stone-300 mt-1">
                    Extra search terms. Not shown on the shop, but matched by shop search alongside the name, brand, description and size.
                  </p>
                </div>

                <VariantEditor
                  variants={addForm.variants}
                  onChange={updateVariant}
                  onAdd={addVariantRow}
                  onRemove={removeVariantRow}
                  onUploadingChange={handleUploadingChange}
                />

                <ShippingFields
                  draft={addForm.shipping}
                  onChange={shipping => setAddForm(prev => ({ ...prev, shipping }))}
                />

                <label className="flex items-center gap-2 text-xs text-stone-500">
                  <input
                    type="checkbox"
                    checked={addForm.isPlaceholder}
                    onChange={e => setAddForm(prev => ({ ...prev, isPlaceholder: e.target.checked }))}
                    className="accent-gold-500"
                  />
                  Mark as placeholder - awaiting final copy, pricing or photography
                </label>

                <label className="flex items-center gap-2 text-xs text-stone-500">
                  <input
                    type="checkbox"
                    checked={addForm.newIn}
                    onChange={e => setAddForm(prev => ({ ...prev, newIn: e.target.checked }))}
                    className="accent-gold-500"
                  />
                  New In - show a &ldquo;New In&rdquo; badge and feature in the homepage carousel
                </label>

                {uploadingCount > 0 && (
                  <p className="text-[10px] text-gold-700">Waiting for {uploadingCount > 1 ? 'photos' : 'a photo'} to finish uploading before this can be saved…</p>
                )}
                {addError && <p className="text-xs text-red-500">{addError}</p>}

                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={addSaving || uploadingCount > 0}
                    className="bg-gold-700 text-white text-[9px] tracking-wider uppercase px-4 py-2 hover:bg-gold-800 transition-colors disabled:opacity-50"
                  >
                    {addSaving ? 'Creating…' : 'Create Product'}
                  </button>
                  <button
                    type="button"
                    onClick={resetAddForm}
                    className="border border-stone-200 text-stone-500 text-[9px] tracking-wider uppercase px-4 py-2 hover:border-gold-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
    </>
  );
}
