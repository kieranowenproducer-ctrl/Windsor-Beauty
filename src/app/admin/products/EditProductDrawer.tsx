'use client';

import { useState } from 'react';
import {
  sortVariantsByStrength,
  DEFAULT_PRODUCT_SPECS,
  DEFAULT_CERTIFICATE_CAUTION,
  DEFAULT_STORAGE_INSTRUCTIONS_MARKDOWN,
  type Product,
  type ProductVariant,
  type ProductInfoMode,
  type SpecRowKey,
  type CertificateTestRow,
  type CertificateInfoRow,
} from '@/data/products';
import VariantEditor, { type VariantDraft } from '@/components/admin/VariantEditor';
import ShippingFields, { type ShippingDraft } from '@/components/admin/ShippingFields';
import ImageUploadField from '@/components/admin/ImageUploadField';
import MultiImageUploadField from '@/components/admin/MultiImageUploadField';
import MarkdownLiteEditor from '@/components/admin/MarkdownLiteEditor';
import { genericNameFor } from '@/lib/genericNames';
import {
  APPEARANCE_OPTIONS,
  FORMAT_STANDARDS,
  PURITY_OPTIONS,
  STANDARD_SUMMARY_ROWS,
  STANDARD_TEST_ROWS,
  extraSummaryRows,
  extraTestRows,
  matchingOption,
  standardSummaryValue,
  standardTestResult,
  standardTestSpec,
  type CertificateFormat,
  type StandardSummaryRow,
  type StandardTestRow,
} from '@/lib/certificateStandards';
import { VISIBILITY_CHOICES, visibilityChoiceFor, HIDDEN_CHOICE, type ProductVisibilityChoice } from './productListUtils';
import {
  toggleCategoryIn,
  certificateDraftToPayload,
  certificatePayloadHasContent,
  type CertificateDraft,
  type ProductInfoDraft,
} from './productDrafts';
import CertificatePreviewPanel from './CertificatePreviewPanel';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

type InfoSectionKey = 'verificationSummary' | 'analyticalResults';

const CUSTOM_OPTION = '__type-my-own__';
const cellClass = 'w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none';

/**
 * The standard wording for a row, chosen from the approved list rather than
 * typed out every time. Falls back to a plain box the moment the value is
 * something not on the list, so a one-off wording is never blocked.
 */
function StandardWordingPicker({
  value, options, onChange, label,
}: { value: string; options: readonly string[]; onChange: (value: string) => void; label: string }) {
  // A saved value that is one of the standard wordings shows as chosen, even if
  // it was typed with the American spelling. Genuinely one-off wording opens
  // straight into the typed-in box, and picking "Type my own" holds that box
  // open while it is still empty, which a value check alone could not do.
  const onList = matchingOption(value, options);
  const [ownWording, setOwnWording] = useState(Boolean(value) && !onList);
  const typingOwn = ownWording || (Boolean(value) && !onList);
  return (
    <div className="space-y-1">
      <select
        value={typingOwn ? CUSTOM_OPTION : (onList ?? value)}
        onChange={e => {
          const chosen = e.target.value;
          setOwnWording(chosen === CUSTOM_OPTION);
          if (chosen !== CUSTOM_OPTION) onChange(chosen);
        }}
        aria-label={label}
        className={`${cellClass} bg-white`}
      >
        {!value && <option value="">Choose the standard wording…</option>}
        {options.map(option => <option key={option} value={option}>{option}</option>)}
        <option value={CUSTOM_OPTION}>Type my own…</option>
      </select>
      {typingOwn && (
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Type the wording for this certificate"
          aria-label={`${label} (typed in)`}
          className={cellClass}
        />
      )}
    </div>
  );
}

interface Props {
  editingId: string | null;
  editingProduct: Product | null;
  setEditingId: (value: string | null) => void;
  /** Whether the live certificate preview sits beside these fields (task f5c8da12). */
  certPreviewOpen: boolean;
  setCertPreviewOpen: (open: boolean) => void;
  editForm: Partial<Product>;
  setEditForm: (update: (prev: Partial<Product>) => Partial<Product>) => void;
  /** Whether this product is off the shop. Applied on Save changes, like every other field here. */
  editHidden: boolean;
  setEditHidden: (hidden: boolean) => void;
  editVariants: VariantDraft[];
  updateEditVariant: (index: number, field: keyof VariantDraft, value: string | boolean | ShippingDraft) => void;
  addEditVariantRow: () => void;
  removeEditVariantRow: (index: number) => void;
  editShipping: ShippingDraft;
  setEditShipping: (value: ShippingDraft) => void;
  editKeywordsInput: string;
  setEditKeywordsInput: (value: string) => void;
  certDrafts: Record<string, CertificateDraft>;
  certTarget: string;
  setCertTarget: (value: string) => void;
  editCertificate: CertificateDraft;
  setEditCertificate: (update: CertificateDraft | ((prev: CertificateDraft) => CertificateDraft)) => void;
  updateEditCertificateRow: (index: number, field: keyof CertificateTestRow, value: string) => void;
  addEditCertificateRow: () => void;
  removeEditCertificateRow: (index: number) => void;
  certFormat: CertificateFormat;
  setCertFormat: (format: CertificateFormat) => void;
  certFormatChanged: string[];
  setStandardTest: (row: StandardTestRow, field: 'specification' | 'result', value: string) => void;
  setStandardSummary: (row: StandardSummaryRow, value: string) => void;
  updateEditInfoRow: (section: InfoSectionKey, index: number, field: keyof CertificateInfoRow, value: string) => void;
  addEditInfoRow: (section: InfoSectionKey) => void;
  removeEditInfoRow: (section: InfoSectionKey, index: number) => void;
  editStorageInstructions: ProductInfoDraft;
  setEditStorageInstructions: (update: (prev: ProductInfoDraft) => ProductInfoDraft) => void;
  toggleHiddenSpec: (key: SpecRowKey) => void;
  allCategories: string[];
  handleUploadingChange: (uploading: boolean) => void;
  uploadingCount: number;
  savingEdit: boolean;
  saveEdit: () => void;
  editError: string;
  setEditError: (value: string) => void;
}

export default function EditProductDrawer({
  editingId, editingProduct, setEditingId,
  certPreviewOpen, setCertPreviewOpen,
  editForm, setEditForm, editHidden, setEditHidden,
  editVariants, updateEditVariant, addEditVariantRow, removeEditVariantRow,
  editShipping, setEditShipping, editKeywordsInput, setEditKeywordsInput,
  certDrafts, certTarget, setCertTarget, editCertificate, setEditCertificate,
  updateEditCertificateRow, addEditCertificateRow, removeEditCertificateRow,
  certFormat, setCertFormat, certFormatChanged, setStandardTest, setStandardSummary,
  updateEditInfoRow, addEditInfoRow, removeEditInfoRow,
  editStorageInstructions, setEditStorageInstructions, toggleHiddenSpec,
  allCategories, handleUploadingChange, uploadingCount,
  savingEdit, saveEdit, editError, setEditError,
}: Props) {
  return (
    <>
          {/* Product edit drawer */}
          {editingId && editingProduct && (
            <>
              <div
                className="fixed inset-0 z-[60] bg-black/20"
                onClick={() => { setEditingId(null); setEditError(''); }}
              />
              {/* The certificate, live, beside the fields that produce it (task f5c8da12). On a wide
                  screen it fills the empty space to the left of the drawer — max-w-2xl is 42rem, so
                  right-[42rem] puts its edge exactly against the drawer. Below that width there is
                  no room for both, so it covers the fields instead and "Hide preview" brings them
                  back. */}
              {certPreviewOpen && (
                <div className="fixed inset-0 z-[75] xl:right-[42rem] xl:z-[70]">
                  <CertificatePreviewPanel
                    product={editingProduct}
                    draft={editCertificate}
                    dosage={certTarget}
                    onClose={() => setCertPreviewOpen(false)}
                  />
                </div>
              )}
              <div className="fixed top-0 right-0 z-[70] h-[100dvh] w-full max-w-2xl bg-white shadow-2xl flex flex-col">
                <div className="flex items-center justify-between px-6 py-5 border-b border-stone-200 shrink-0">
                  <div>
                    <h2 className="text-xs font-semibold text-stone-700 tracking-wide">Edit Product</h2>
                    <p className="text-[9px] text-stone-400 mt-0.5">{editingProduct.name}</p>
                  </div>
                  <button
                    onClick={() => { setEditingId(null); setEditError(''); }}
                    className="p-1.5 text-stone-400 hover:text-stone-700 transition-colors"
                    aria-label="Close"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="flex items-center gap-3 overflow-x-auto px-6 py-2 border-b border-stone-100 shrink-0 bg-stone-50">
                  {[
                    { id: 'edit-section-details', label: 'Details' },
                    { id: 'edit-section-description', label: 'Description' },
                    { id: 'edit-section-categories', label: 'Categories' },
                    { id: 'edit-section-image', label: 'Image' },
                    { id: 'edit-section-variants', label: 'Variants' },
                    { id: 'edit-section-shipping', label: 'Shipping' },
                    { id: 'edit-section-specs', label: 'Specs' },
                    { id: 'certificate-edit-section', label: 'Certificate' },
                    { id: 'edit-section-storage', label: 'Storage' },
                  ].map(section => (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                      className="shrink-0 text-[9px] tracking-wider uppercase text-stone-400 hover:text-gold-700 transition-colors whitespace-nowrap"
                    >
                      {section.label}
                    </button>
                  ))}
                </div>
                <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5 space-y-3">

        <div id="edit-section-details" className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-1">Name</label>
            <input
              value={editForm.name || ''}
              onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
              className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none"
            />
          </div>
          <div>
            <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-1">Short Description</label>
            <input
              value={editForm.shortDescription || ''}
              onChange={e => setEditForm(p => ({ ...p, shortDescription: e.target.value }))}
              className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none"
            />
          </div>
          <div>
            <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-1">Purity</label>
            <input
              value={editForm.purity || ''}
              onChange={e => setEditForm(p => ({ ...p, purity: e.target.value }))}
              className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none"
            />
          </div>
          <div>
            <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-1">Brand (optional)</label>
            <input
              value={editForm.brand || ''}
              onChange={e => setEditForm(p => ({ ...p, brand: e.target.value }))}
              placeholder="e.g. Remedium Research"
              className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none"
            />
          </div>
          {/* The real product name is never sent to Royal Mail or Fena — this is
              what goes in its place. Left blank, a new product is given a name
              automatically from the reserve pool on save (see genericNames.ts). */}
          <div>
            <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-1">Shipping description</label>
            <input
              value={editForm.genericName || ''}
              onChange={e => setEditForm(p => ({ ...p, genericName: e.target.value }))}
              placeholder="Assigned automatically when left blank"
              className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none"
            />
            <p className="text-[9px] text-stone-400 mt-1 leading-snug">
              What Royal Mail and Fena are told this product is. The real name and dosage are never sent to them.
              Customs descriptions are separate and unaffected.
              {!editForm.genericName?.trim() && editForm.slug && (
                <>
                  {' '}Currently sending{' '}
                  <strong className="text-stone-600">
                    &ldquo;{genericNameFor(editForm as Product, editForm.slug).name}&rdquo;
                  </strong>
                  {genericNameFor(editForm as Product, editForm.slug).source === 'default'
                    ? ' — not unique. Type one, or leave blank and one is assigned on save.'
                    : ' from the standard list. Type here to override it.'}
                </>
              )}
            </p>
          </div>
          <div>
            <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-1">Availability</label>
            <select
              value={visibilityChoiceFor(editForm.availability, editHidden)}
              onChange={e => {
                const choice = e.target.value as ProductVisibilityChoice;
                // Picking Hidden leaves the availability underneath alone, so
                // picking Available again puts the product back exactly as it was.
                if (choice === HIDDEN_CHOICE) setEditHidden(true);
                else {
                  setEditHidden(false);
                  setEditForm(p => ({ ...p, availability: choice }));
                }
              }}
              className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none bg-white"
            >
              {VISIBILITY_CHOICES.map(choice => (
                <option key={choice.value} value={choice.value}>{choice.label}</option>
              ))}
            </select>
            <p className="text-[9px] text-stone-400 mt-1 leading-snug">
              {editHidden
                ? 'Hidden takes this product off the shop and every customer page when you press Save changes. Nothing is deleted, and picking Available puts it straight back.'
                : 'Pick “Hidden (off the site)” to take this product off the shop and every customer page. Nothing is deleted.'}
            </p>
          </div>
          <div>
            <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-1">Search Keywords (comma separated)</label>
            <input
              value={editKeywordsInput}
              onChange={e => setEditKeywordsInput(e.target.value)}
              placeholder="e.g. mounjaro, monjaro, weight loss jab"
              className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none"
            />
          </div>
        </div>

        <div id="edit-section-description" className="mb-3">
          <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-1">Full Description</label>
          <MarkdownLiteEditor
            value={editForm.fullDescription || ''}
            onChange={text => setEditForm(p => ({ ...p, fullDescription: text, fullDescriptionFormat: 'markdown' }))}
            placeholder="Enter the full product description..."
            height="200px"
          />
        </div>

        <div id="edit-section-categories" className="mb-3">
          <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-1">Categories</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 border border-stone-200 p-3">
            {allCategories.map(cat => (
              <label key={cat} className="flex items-center gap-1.5 text-xs text-stone-600">
                <input
                  type="checkbox"
                  checked={(editForm.categories || []).includes(cat)}
                  onChange={() => setEditForm(p => ({ ...p, categories: toggleCategoryIn(p.categories || [], cat) }))}
                  className="accent-gold-500"
                />
                {cat}
              </label>
            ))}
          </div>
        </div>

        <div id="edit-section-image" className="mb-3">
          <ImageUploadField
            value={editForm.image}
            onChange={url => setEditForm(p => ({ ...p, image: url }))}
            fallbackSrc={editingProduct ? `/images/products/${editingProduct.slug}.jpg` : undefined}
            fallbackHint="No photo uploaded yet — the storefront is showing a placeholder."
            onUploadingChange={handleUploadingChange}
          />
        </div>

        <div id="edit-section-variants" className="mb-3">
          <VariantEditor
            variants={editVariants}
            onChange={updateEditVariant}
            onAdd={addEditVariantRow}
            onRemove={removeEditVariantRow}
            onUploadingChange={handleUploadingChange}
          />
        </div>

        <div id="edit-section-shipping" className="mb-3">
          <ShippingFields draft={editShipping} onChange={setEditShipping} />
        </div>

        <div id="edit-section-specs" className="mb-3">
          <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-1">
            Product Page Info (optional overrides)
          </label>
          <p className="text-[10px] text-stone-400 mb-2 leading-relaxed">
            Shown in the &ldquo;Product specs&rdquo; block on this product&apos;s page. Leave any field
            blank to use the standard wording shown as its placeholder.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([
              { key: 'form' as SpecRowKey, label: 'Form', value: editForm.form, field: 'form' as const },
              { key: 'storage' as SpecRowKey, label: 'Storage', value: editForm.storage, field: 'storage' as const },
              { key: 'usage' as SpecRowKey, label: 'Usage', value: editForm.usage, field: 'usage' as const },
              { key: 'coa' as SpecRowKey, label: 'CoA', value: editForm.coa, field: 'coa' as const },
            ]).map(row => {
              const hidden = (editForm.hiddenSpecs ?? []).includes(row.key);
              return (
                <div key={row.key}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[8px] tracking-widest uppercase text-stone-400">{row.label}</label>
                    <label className="flex items-center gap-1 text-[8px] tracking-widest uppercase text-stone-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!hidden}
                        onChange={() => toggleHiddenSpec(row.key)}
                        className="accent-gold-500"
                      />
                      Show
                    </label>
                  </div>
                  <input
                    value={row.value || ''}
                    onChange={e => setEditForm(p => ({ ...p, [row.field]: e.target.value }))}
                    placeholder={DEFAULT_PRODUCT_SPECS[row.field]}
                    disabled={hidden}
                    className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none disabled:bg-stone-50 disabled:text-stone-300"
                  />
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-stone-400 mt-2 leading-relaxed">
            Untick &ldquo;Show&rdquo; to remove that row from the &ldquo;Product specs&rdquo; block on this
            product&apos;s page entirely.
          </p>
        </div>

        <div id="certificate-edit-section" className="mb-3 border border-gold-100 p-3">
          {/* Without this there is no way to see what these fields produce, or which of them is
              the one with the problem, until after a save on another screen entirely. */}
          <button
            type="button"
            onClick={() => setCertPreviewOpen(!certPreviewOpen)}
            className={`mb-3 w-full text-[10px] tracking-[0.15em] uppercase px-4 py-2.5 transition-colors ${
              certPreviewOpen
                ? 'border border-stone-300 text-stone-600 hover:border-gold-400 hover:text-gold-700'
                : 'bg-gold-700 text-white hover:bg-gold-800'
            }`}
          >
            {certPreviewOpen ? 'Hide the certificate preview' : 'Show the certificate, with anything wrong marked in red'}
          </button>
          {/* Is this a vial or a pen? Pressing one fills in that format's
              storage and appearance wording, so a pen never keeps a vial's
              powder wording just because nobody remembered to change it. */}
          <div className="mb-3 border border-stone-200 bg-stone-50 p-2.5">
            <p className="text-[10px] tracking-[0.15em] uppercase text-stone-500 font-semibold mb-2">
              What is this product?
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {(['vial', 'pen'] as const).map(format => (
                <button
                  key={format}
                  type="button"
                  onClick={() => setCertFormat(format)}
                  aria-pressed={certFormat === format}
                  className={`text-[10px] tracking-[0.15em] uppercase px-4 py-2 transition-colors ${
                    certFormat === format
                      ? 'bg-gold-700 text-white'
                      : 'border border-stone-300 text-stone-600 hover:border-gold-400 hover:text-gold-700'
                  }`}
                >
                  {FORMAT_STANDARDS[format].label}
                </button>
              ))}
              <p className="text-[10px] text-stone-500 leading-snug">{FORMAT_STANDARDS[certFormat].description}</p>
            </div>
            <p className="text-[10px] text-stone-400 mt-2 leading-relaxed">
              Pressing one of these sets the storage line and the appearance wording below to the
              standard for that format. Anything you have typed yourself is left as it is, and no
              measured result is ever changed.
            </p>
            {certFormatChanged.length > 0 && (
              <p className="text-[10px] text-gold-700 mt-1.5 leading-relaxed">
                Updated to the {FORMAT_STANDARDS[certFormat].label.toLowerCase()} standard:{' '}
                {certFormatChanged.join(', ')}. Nothing is saved until you press Save Changes, so
                press Cancel if that was not what you wanted.
              </p>
            )}
          </div>
          {editVariants.length >= 2 && (
            <div className="mb-3 border border-gold-200 bg-gold-50/50 p-2.5 rounded">
              <label className="block text-[10px] tracking-[0.15em] uppercase text-gold-700 font-semibold mb-1.5">
                Certificate for
              </label>
              <select
                value={certTarget}
                onChange={e => setCertTarget(e.target.value)}
                className="w-full border border-gold-300 bg-white px-2 py-1.5 text-xs text-stone-700 focus:border-gold-500 outline-none"
              >
                <option value="">All dosages (shared certificate)</option>
                {sortVariantsByStrength(editVariants.map(v => ({ dosage: v.dosage, price: 0 } as ProductVariant))).map(v => {
                  const hasOwn = certDrafts[v.dosage] && certificatePayloadHasContent(certificateDraftToPayload(certDrafts[v.dosage]));
                  return (
                    <option key={v.dosage} value={v.dosage}>
                      {v.dosage} — {hasOwn ? 'has its own certificate' : 'uses the shared certificate'}
                    </option>
                  );
                })}
              </select>
              <p className="text-[10px] text-stone-500 mt-1.5 leading-relaxed">
                A certificate is per dosage — each dosage is a separate batch with its own lab report.
                Pick a dosage to give it its own certificate; leave it on the shared one to reuse the
                product-level certificate for that dosage. The customer sees the certificate for the
                dosage they select.
              </p>
            </div>
          )}
          <label className="flex items-center gap-2 text-xs text-stone-600 font-medium mb-3">
            <input
              type="checkbox"
              checked={editCertificate.enabled}
              onChange={e => setEditCertificate(p => ({ ...p, enabled: e.target.checked }))}
              className="accent-gold-500"
            />
            {certTarget
              ? `Certificate of Analysis for ${certTarget} — shown when the customer selects ${certTarget}`
              : 'Certificate of Analysis (shared) — show a “Show Certificate” button on this product’s page'}
          </label>

          <div className="flex gap-4 mb-3">
            <label className="flex items-center gap-2 text-xs text-stone-600 font-normal">
              <input
                type="radio"
                name="certificateMode"
                checked={editCertificate.mode === 'template'}
                onChange={() => setEditCertificate(p => ({ ...p, mode: 'template' }))}
                className="accent-gold-500"
              />
              Use Template Certificate
            </label>
            <label className="flex items-center gap-2 text-xs text-stone-600 font-normal">
              <input
                type="radio"
                name="certificateMode"
                checked={editCertificate.mode === 'external'}
                onChange={() => setEditCertificate(p => ({ ...p, mode: 'external' }))}
                className="accent-gold-500"
              />
              Provide External Certificate
            </label>
          </div>

          {editCertificate.mode === 'template' ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-1">Certificate ID</label>
                  <input
                    value={editCertificate.certificateId}
                    onChange={e => setEditCertificate(p => ({ ...p, certificateId: e.target.value }))}
                    placeholder="e.g. WG-AM191"
                    className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-1">Product Name (override)</label>
                  <input
                    value={editCertificate.productName}
                    onChange={e => setEditCertificate(p => ({ ...p, productName: e.target.value }))}
                    placeholder={editingProduct?.name ?? ''}
                    className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-1">CAS Number</label>
                  <input
                    value={editCertificate.casNumber}
                    onChange={e => setEditCertificate(p => ({ ...p, casNumber: e.target.value }))}
                    className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-1">PubChem CID</label>
                  <input
                    value={editCertificate.pubchemCid}
                    onChange={e => setEditCertificate(p => ({ ...p, pubchemCid: e.target.value }))}
                    className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-1">Molecular Formula</label>
                  <input
                    value={editCertificate.molecularFormula}
                    onChange={e => setEditCertificate(p => ({ ...p, molecularFormula: e.target.value }))}
                    className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-1">Molecular Weight</label>
                  <input
                    value={editCertificate.molecularWeight}
                    onChange={e => setEditCertificate(p => ({ ...p, molecularWeight: e.target.value }))}
                    className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-1">Storage (override)</label>
                  <input
                    value={editCertificate.storage}
                    onChange={e => setEditCertificate(p => ({ ...p, storage: e.target.value }))}
                    placeholder={editForm.storage || DEFAULT_PRODUCT_SPECS.storage}
                    className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none"
                  />
                </div>
              </div>

              {/* The rows every certificate must carry. Their names are fixed,
                  the standard wording is chosen from a list, and only the
                  measured column is typed by hand. */}
              <div className="mb-3 border border-gold-200 bg-gold-50/40 p-2.5">
                <p className="text-[10px] tracking-[0.15em] uppercase text-gold-700 font-semibold mb-1">
                  Standard rows — always on the certificate
                </p>
                <p className="text-[10px] text-stone-500 mb-3 leading-relaxed">
                  These five are on every certificate and their names cannot change. The middle
                  column is the standard the batch is measured against, and it is filled in for you.
                  The right-hand column is the real figure from this batch&apos;s lab report — type
                  only what the report actually says, and leave it blank until you have it.
                </p>
                <div className="hidden sm:grid grid-cols-[110px_1fr_1fr] gap-2 mb-1">
                  <span className="text-[8px] tracking-widest uppercase text-stone-400">Row</span>
                  <span className="text-[8px] tracking-widest uppercase text-stone-400">Standard</span>
                  <span className="text-[8px] tracking-widest uppercase text-stone-400">Measured result</span>
                </div>
                {STANDARD_TEST_ROWS.map(row => {
                  const spec = standardTestSpec(editCertificate.testRows, row);
                  const result = standardTestResult(editCertificate.testRows, row);
                  return (
                    <div key={row.key} className="grid grid-cols-1 sm:grid-cols-[110px_1fr_1fr] gap-2 mb-1.5 sm:items-start">
                      <span className="text-xs text-stone-600 font-medium sm:py-1.5">{row.name}</span>
                      {row.key === 'appearance' ? (
                        <StandardWordingPicker
                          value={spec}
                          options={APPEARANCE_OPTIONS}
                          onChange={value => setStandardTest(row, 'specification', value)}
                          label="Appearance standard"
                        />
                      ) : row.key === 'purity' ? (
                        <StandardWordingPicker
                          value={spec}
                          options={PURITY_OPTIONS}
                          onChange={value => setStandardTest(row, 'specification', value)}
                          label="Purity standard"
                        />
                      ) : (
                        <input
                          value={spec}
                          onChange={e => setStandardTest(row, 'specification', e.target.value)}
                          placeholder="e.g. 10mg (label claim)"
                          aria-label="Content standard"
                          className={cellClass}
                        />
                      )}
                      <input
                        value={result}
                        onChange={e => setStandardTest(row, 'result', e.target.value)}
                        placeholder={row.placeholder}
                        aria-label={`${row.name} measured result`}
                        className={cellClass}
                      />
                    </div>
                  );
                })}
                {STANDARD_SUMMARY_ROWS.map(row => (
                  <div key={row.key} className="grid grid-cols-1 sm:grid-cols-[110px_1fr_1fr] gap-2 mb-1.5 sm:items-center">
                    <span className="text-xs text-stone-600 font-medium">{row.name}</span>
                    <span className="hidden sm:block text-[10px] text-stone-400 py-1.5">From the lab report</span>
                    <input
                      value={standardSummaryValue(editCertificate.verificationSummary, row)}
                      onChange={e => setStandardSummary(row, e.target.value)}
                      placeholder={row.placeholder}
                      aria-label={row.name}
                      className={cellClass}
                    />
                  </div>
                ))}
                <p className="text-[10px] text-stone-400 mt-2 leading-relaxed">
                  A row you leave completely blank is not saved and does not appear on the printed
                  certificate — nothing empty is ever shown to a customer.
                </p>
              </div>

              {/* Anything beyond the standard rows — sterility, endotoxin, a
                  blend's per-component purity — still lives here. */}
              <div className="mb-3">
                <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-1.5">Other Test Rows</label>
                <p className="text-[10px] text-stone-400 mb-2 leading-relaxed">
                  Only for tests beyond the standard five above, e.g. Sterility / Sterile / Conforms
                </p>
                {extraTestRows(editCertificate.testRows).map(({ row, index }) => (
                  <div key={index} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 mb-1.5 sm:items-center">
                    <input
                      value={row.test}
                      onChange={e => updateEditCertificateRow(index, 'test', e.target.value)}
                      placeholder="Test"
                      className={cellClass}
                    />
                    <input
                      value={row.specification}
                      onChange={e => updateEditCertificateRow(index, 'specification', e.target.value)}
                      placeholder="Specification"
                      className={cellClass}
                    />
                    <input
                      value={row.result}
                      onChange={e => updateEditCertificateRow(index, 'result', e.target.value)}
                      placeholder="Result"
                      className={cellClass}
                    />
                    <button
                      type="button"
                      onClick={() => removeEditCertificateRow(index)}
                      className="justify-self-start sm:justify-self-auto p-2 -m-2 sm:p-1 sm:m-0 text-[9px] tracking-wider uppercase text-stone-300 hover:text-red-400 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addEditCertificateRow}
                  className="text-[9px] tracking-wider uppercase text-gold-700 hover:text-gold-700 transition-colors"
                >
                  + Add Test Row
                </button>
              </div>

              {/* Verification Summary / Analytical Results — optional, generic
                  label/value sections for certificates whose source data (issue
                  date, batch/lot, instrument, mass-spec peaks, etc.) doesn't fit
                  the Product Specifications / Test Results shapes above. Empty
                  by default and omitted from the certificate entirely when no
                  rows are filled in. */}
              {([
                { section: 'verificationSummary' as const, title: 'Other Verification Rows', hint: 'Beyond Batch / Lot and Test Date above, e.g. Laboratory / Janoshik Analytical' },
                { section: 'analyticalResults' as const, title: 'Analytical Results', hint: 'e.g. Main Peak / #1 @ 6.261 min' },
              ]).map(({ section, title, hint }) => {
                // Batch / Lot and Test Date are edited in the standard block
                // above, so they are filtered out here rather than shown twice.
                // The original index is kept so the existing edit and remove
                // handlers still address the right row.
                const rows = section === 'verificationSummary'
                  ? extraSummaryRows(editCertificate.verificationSummary)
                  : editCertificate.analyticalResults.map((row, index) => ({ row, index }));
                return (
                  <div key={section} className="mb-3">
                    <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-1.5">{title}</label>
                    <p className="text-[10px] text-stone-400 mb-2 leading-relaxed">{hint}</p>
                    {rows.map(({ row, index }) => (
                      <div key={index} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 mb-1.5 sm:items-center">
                        <input
                          value={row.label}
                          onChange={e => updateEditInfoRow(section, index, 'label', e.target.value)}
                          placeholder="Label"
                          className={cellClass}
                        />
                        <input
                          value={row.value}
                          onChange={e => updateEditInfoRow(section, index, 'value', e.target.value)}
                          placeholder="Value"
                          className={cellClass}
                        />
                        <button
                          type="button"
                          onClick={() => removeEditInfoRow(section, index)}
                          className="justify-self-start sm:justify-self-auto p-2 -m-2 sm:p-1 sm:m-0 text-[9px] tracking-wider uppercase text-stone-300 hover:text-red-400 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addEditInfoRow(section)}
                      className="text-[9px] tracking-wider uppercase text-gold-700 hover:text-gold-700 transition-colors"
                    >
                      + Add Row
                    </button>
                  </div>
                );
              })}

              <div className="mb-3">
                <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-1">Caution / Disclaimer</label>
                <textarea
                  value={editCertificate.caution}
                  onChange={e => setEditCertificate(p => ({ ...p, caution: e.target.value }))}
                  placeholder={DEFAULT_CERTIFICATE_CAUTION}
                  rows={2}
                  className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none resize-none"
                />
              </div>

              <ImageUploadField
                value={editCertificate.image}
                onChange={url => setEditCertificate(p => ({ ...p, image: url }))}
                fallbackSrc={editForm.image || (editingProduct ? `/images/products/${editingProduct.slug}.jpg` : undefined)}
                label="Certificate Image"
                fallbackHint="Falls back to the product photo when no certificate-specific image is uploaded."
                onUploadingChange={handleUploadingChange}
              />
            </>
          ) : (
            <div>
              <p className="text-[10px] text-stone-400 mb-2.5 leading-relaxed">
                Upload the supplier&apos;s own certificate as one image per page, in order. The &ldquo;Show
                Certificate&rdquo; button on the product page will display these pages instead of the generated
                template above.
              </p>
              <MultiImageUploadField
                value={editCertificate.externalImages}
                onChange={urls => setEditCertificate(p => ({ ...p, externalImages: urls }))}
                endpoint="/api/admin/products/upload-image"
                label="Certificate Pages"
                onUploadingChange={handleUploadingChange}
              />
            </div>
          )}
        </div>

        <div id="edit-section-storage" className="mb-3 border border-gold-100 p-3">
          <label className="block text-xs text-stone-600 font-medium mb-3">
            Storage Instructions — shown via a &ldquo;Storage Instructions&rdquo; button on this product&apos;s page
          </label>

          <div className="mb-3">
            <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-1">Content Source</label>
            <select
              value={editStorageInstructions.mode}
              onChange={e => {
                const mode = e.target.value as ProductInfoMode;
                setEditStorageInstructions(p => ({
                  mode,
                  content: mode === 'custom' && !p.content.trim() ? DEFAULT_STORAGE_INSTRUCTIONS_MARKDOWN : p.content,
                }));
              }}
              className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none bg-white"
            >
              <option value="global">Use global default (edit under Site Content → Product Defaults)</option>
              <option value="custom">Custom override for this product</option>
              <option value="hidden">Hidden — don&apos;t show the button on this product</option>
            </select>
          </div>

          {editStorageInstructions.mode === 'custom' && (
            <div>
              <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-1">Custom Content</label>
              <MarkdownLiteEditor
                value={editStorageInstructions.content}
                onChange={text => setEditStorageInstructions(p => ({ ...p, content: text }))}
                height="200px"
              />
            </div>
          )}
        </div>

        <label className="flex items-center gap-2 text-xs text-stone-500 mb-3">
          <input
            type="checkbox"
            checked={editForm.newIn ?? false}
            onChange={e => setEditForm(p => ({ ...p, newIn: e.target.checked }))}
            className="accent-gold-500"
          />
          New In — show a &ldquo;New In&rdquo; badge and feature in the homepage carousel
        </label>

                </div>
                <div className="shrink-0 border-t border-stone-200 px-6 py-4 flex items-center gap-3">
                  <button
                    onClick={saveEdit}
                    disabled={savingEdit || uploadingCount > 0}
                    className="bg-gold-700 text-white text-[9px] tracking-[0.18em] uppercase px-5 py-2.5 hover:bg-gold-800 transition-colors disabled:opacity-50"
                  >
                    {savingEdit ? 'Saving…' : uploadingCount > 0 ? 'Uploading…' : 'Save Changes'}
                  </button>
                  <button
                    onClick={() => { setEditingId(null); setEditError(''); }}
                    className="border border-stone-200 text-stone-500 text-[9px] tracking-[0.15em] uppercase px-5 py-2.5 hover:border-gold-300 transition-colors"
                  >
                    Cancel
                  </button>
                  {uploadingCount > 0 && (
                    <p className="text-[10px] text-gold-700">Waiting for {uploadingCount > 1 ? 'photos' : 'a photo'} to finish uploading…</p>
                  )}
                  {editError && <p className="text-xs text-red-500">{editError}</p>}
                </div>
              </div>
            </>
          )}
    </>
  );
}
