'use client';

import { useEffect, useMemo, useState } from 'react';
import { isValidButtonLink } from '@/lib/promotionRoutes';
import { ALL_CATEGORIES, PRODUCTS, mergeProducts, type Product } from '@/data/products';
import AdminSidebar from '@/components/admin/AdminSidebar';

import PromotionForm from './PromotionForm';
import PromotionsTable from './PromotionsTable';
import RuleForm from './RuleForm';
import RulesTable from './RulesTable';
import {
  EMPTY_FORM,
  EMPTY_SELECTOR,
  EMPTY_BUNDLE_ITEM,
  EMPTY_RULE_FORM,
  selectorToForm,
  buildBogoConfig,
  buildBundleConfig,
  buildSpendThresholdConfig,
  toDatetimeLocal,
  type PromotionRow,
  type PromotionRuleRow,
  type BundleItemFormState,
  type RuleFormState,
} from './promotionRuleForms';

export default function AdminPromotionsPage() {
  const [promotions, setPromotions] = useState<PromotionRow[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Tracks in-flight image uploads so Save can't fire (and silently revert
  // the just-added photo) before the upload actually finishes — same fix
  // already applied to the product image uploader.
  const [uploadingCount, setUploadingCount] = useState(0);
  function handleUploadingChange(uploading: boolean) {
    setUploadingCount(c => Math.max(0, c + (uploading ? 1 : -1)));
  }

  // Percentage Discount promotion type — product/category picker, lifted
  // from the old Discount Codes -> Automatic Sale Discounts section (moved
  // here since it's an automatic visible offer, not a customer-entered code).
  const [discountProductSearch, setDiscountProductSearch] = useState('');
  const [discountProductCategoryFilter, setDiscountProductCategoryFilter] = useState('All');

  // Automatic promotion rules
  const [overrides, setOverrides] = useState<Record<string, Product>>({});
  const products = useMemo(() => mergeProducts(PRODUCTS, overrides), [overrides]);
  const [allCategories, setAllCategories] = useState<string[]>([...ALL_CATEGORIES]);

  const discountFilteredProducts = useMemo(() => {
    const query = discountProductSearch.trim().toLowerCase();
    return products.filter((product) => {
      if (discountProductCategoryFilter !== 'All' && !product.categories.includes(discountProductCategoryFilter)) return false;
      if (query && !product.name.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [products, discountProductCategoryFilter, discountProductSearch]);

  // Read-only preview of which products this percentage promotion currently
  // covers, computed live from the form's scope selection — lets the admin
  // see exactly what will show on the Special Offers page before saving.
  const discountPreviewProducts = useMemo(() => {
    if (form.promotionType !== 'percentage') return [];
    if (form.discountScopeType === 'all') return products;
    if (form.discountScopeType === 'category') {
      return products.filter((p) => p.categories.some((c) => form.discountScopeCategories.includes(c)));
    }
    return products.filter((p) => form.discountScopeProductSlugs.includes(p.slug));
  }, [form.promotionType, form.discountScopeType, form.discountScopeCategories, form.discountScopeProductSlugs, products]);
  const [rules, setRules] = useState<PromotionRuleRow[] | null>(null);
  const [rulesLoadError, setRulesLoadError] = useState('');
  const [ruleForm, setRuleForm] = useState<RuleFormState>(EMPTY_RULE_FORM);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [ruleSaveStatus, setRuleSaveStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [ruleSaveMessage, setRuleSaveMessage] = useState('');
  const [ruleDeleteId, setRuleDeleteId] = useState<number | null>(null);
  const [ruleDeleteConfirm, setRuleDeleteConfirm] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/admin/products/catalogue')
      .then(res => res.json())
      .then(data => {
        if (data.overrides && typeof data.overrides === 'object') setOverrides(data.overrides);
      })
      .catch(() => {});
    fetch('/api/admin/categories')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data.categories)) setAllCategories(data.categories.map((c: { category: string }) => c.category));
      })
      .catch(() => {});
  }, []);

  async function loadRules() {
    try {
      const res = await fetch('/api/admin/promotion-rules');
      const data = await res.json();
      if (res.ok) {
        setRules(data.rules ?? []);
        setRulesLoadError('');
      } else {
        setRulesLoadError(data.error || 'Failed to load promotion rules.');
      }
    } catch {
      setRulesLoadError('Failed to load promotion rules.');
    }
  }

  useEffect(() => {
    loadRules();
  }, []);

  function setRuleType(type: RuleFormState['type']) {
    setRuleForm(prev => ({
      ...EMPTY_RULE_FORM,
      name: prev.name,
      active: prev.active,
      startDate: prev.startDate,
      endDate: prev.endDate,
      priority: prev.priority,
      type,
    }));
  }

  function addBundleItem() {
    setRuleForm(prev => ({ ...prev, bundleItems: [...prev.bundleItems, { ...EMPTY_BUNDLE_ITEM }] }));
  }

  function removeBundleItem(index: number) {
    setRuleForm(prev => ({ ...prev, bundleItems: prev.bundleItems.filter((_, i) => i !== index) }));
  }

  function updateBundleItem(index: number, patch: Partial<BundleItemFormState>) {
    setRuleForm(prev => ({
      ...prev,
      bundleItems: prev.bundleItems.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  }

  function startRuleEdit(row: PromotionRuleRow) {
    const config = (row.config ?? {}) as Record<string, unknown>;
    let next: RuleFormState = {
      ...EMPTY_RULE_FORM,
      name: row.name,
      type: (row.type as RuleFormState['type']) ?? 'bogo',
      active: row.active,
      startDate: toDatetimeLocal(row.start_date),
      endDate: toDatetimeLocal(row.end_date),
      priority: String(row.priority),
    };

    if (row.type === 'bogo') {
      const buy = (config.buy ?? {}) as Record<string, unknown>;
      const get = config.get as Record<string, unknown> | undefined;
      next = {
        ...next,
        buySelector: selectorToForm(buy.selector),
        buyQuantity: String(buy.quantity ?? 2),
        sameAsBuy: !get,
        getSelector: get ? selectorToForm(get.selector) : { ...EMPTY_SELECTOR },
        getQuantity: String(get?.quantity ?? 1),
        bogoRewardType: config.rewardType === 'percent_off' ? 'percent_off' : 'free',
        bogoRewardPercent: String(config.rewardPercent ?? 50),
      };
    } else if (row.type === 'bundle') {
      const items = Array.isArray(config.items) ? (config.items as Record<string, unknown>[]) : [];
      next = {
        ...next,
        bundleItems: items.length >= 2
          ? items.map((item) => ({
              slug: typeof item.slug === 'string' ? item.slug : '',
              dosage: typeof item.dosage === 'string' ? item.dosage : '',
              quantity: String(item.quantity ?? 1),
            }))
          : [{ ...EMPTY_BUNDLE_ITEM }, { ...EMPTY_BUNDLE_ITEM }],
        bundleRewardType: config.rewardType === 'percent_off' ? 'percent_off' : 'bundle_price',
        bundlePrice: config.bundlePrice !== undefined ? String(config.bundlePrice) : '',
        bundleRewardPercent: String(config.rewardPercent ?? 10),
      };
    } else if (row.type === 'spend_threshold') {
      const scope = config.scope as Record<string, unknown> | undefined;
      const freeItem = config.freeItem as Record<string, unknown> | undefined;
      next = {
        ...next,
        minSpend: config.minSpend !== undefined ? String(config.minSpend) : '',
        spendScopeType: scope?.type === 'category' ? 'category' : 'all',
        spendScopeCategory: typeof scope?.category === 'string' ? scope.category : '',
        spendRewardType: config.rewardType === 'free_item' ? 'free_item' : 'percent_off',
        spendRewardPercent: String(config.rewardPercent ?? 10),
        freeItemSlug: typeof freeItem?.slug === 'string' ? freeItem.slug : '',
        freeItemDosage: typeof freeItem?.dosage === 'string' ? freeItem.dosage : '',
        freeItemQuantity: String(freeItem?.quantity ?? 1),
      };
    }

    setEditingRuleId(row.id);
    setRuleForm(next);
    setRuleSaveMessage('');
    setRuleSaveStatus('idle');
  }

  function cancelRuleEdit() {
    setEditingRuleId(null);
    setRuleForm(EMPTY_RULE_FORM);
    setRuleSaveMessage('');
    setRuleSaveStatus('idle');
  }

  async function handleRuleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ruleForm.name.trim()) return;

    const built = ruleForm.type === 'bogo' ? buildBogoConfig(ruleForm)
      : ruleForm.type === 'bundle' ? buildBundleConfig(ruleForm)
      : buildSpendThresholdConfig(ruleForm);

    if (built.error) {
      setRuleSaveStatus('error');
      setRuleSaveMessage(built.error);
      return;
    }

    setRuleSaveStatus('loading');
    setRuleSaveMessage('');

    const priority = Number(ruleForm.priority);
    const payload = {
      name: ruleForm.name.trim(),
      type: ruleForm.type,
      config: built.config,
      active: ruleForm.active,
      startDate: ruleForm.startDate ? new Date(ruleForm.startDate).toISOString() : null,
      endDate: ruleForm.endDate ? new Date(ruleForm.endDate).toISOString() : null,
      priority: Number.isFinite(priority) ? priority : 0,
    };

    try {
      const res = await fetch(editingRuleId ? `/api/admin/promotion-rules/${editingRuleId}` : '/api/admin/promotion-rules', {
        method: editingRuleId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        cancelRuleEdit();
        loadRules();
      } else {
        setRuleSaveStatus('error');
        setRuleSaveMessage(data.error || 'Failed to save promotion rule.');
      }
    } catch {
      setRuleSaveStatus('error');
      setRuleSaveMessage('Failed to save promotion rule.');
    }
  }

  async function handleDeleteRule(row: PromotionRuleRow) {
    setRuleDeleteConfirm(null);
    setRuleDeleteId(row.id);
    try {
      const res = await fetch(`/api/admin/promotion-rules/${row.id}`, { method: 'DELETE' });
      if (res.ok) {
        setRules(prev => prev?.filter(r => r.id !== row.id) ?? prev);
        if (editingRuleId === row.id) cancelRuleEdit();
      }
    } finally {
      setRuleDeleteId(null);
    }
  }

  async function toggleRuleActive(row: PromotionRuleRow) {
    try {
      const res = await fetch(`/api/admin/promotion-rules/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: row.name,
          type: row.type,
          config: row.config,
          active: !row.active,
          startDate: row.start_date,
          endDate: row.end_date,
          priority: row.priority,
        }),
      });
      if (res.ok) {
        setRules(prev => prev?.map(r => r.id === row.id ? { ...r, active: !row.active } : r) ?? prev);
      }
    } catch {
      // ignore
    }
  }

  function describeSelectorForSummary(selector: unknown): string {
    if (!selector || typeof selector !== 'object') return '';
    const s = selector as Record<string, unknown>;
    if (s.scope === 'category') return typeof s.category === 'string' ? s.category : '';
    const slug = typeof s.slug === 'string' ? s.slug : '';
    const product = products.find(p => p.slug === slug);
    const name = product?.name ?? slug;
    return typeof s.dosage === 'string' && s.dosage ? `${name} (${s.dosage})` : name;
  }

  function summarizeRule(row: PromotionRuleRow): string {
    const config = (row.config ?? {}) as Record<string, unknown>;
    if (row.type === 'bogo') {
      const buy = (config.buy ?? {}) as Record<string, unknown>;
      const get = config.get as Record<string, unknown> | undefined;
      const buyName = describeSelectorForSummary(buy.selector);
      const getName = get ? describeSelectorForSummary(get.selector) : buyName;
      const getQty = get?.quantity ?? 1;
      const reward = config.rewardType === 'percent_off' ? `${config.rewardPercent}% off` : 'free';
      return `Buy ${buy.quantity ?? '?'} ${buyName}, get ${getQty} ${getName} ${reward}`;
    }
    if (row.type === 'bundle') {
      const items = Array.isArray(config.items) ? (config.items as Record<string, unknown>[]) : [];
      const names = items
        .map(item => describeSelectorForSummary({ scope: 'product', slug: item.slug, dosage: item.dosage }))
        .join(' + ');
      return config.rewardType === 'percent_off'
        ? `${names}: ${config.rewardPercent}% off`
        : `${names} bundle for £${Number(config.bundlePrice ?? 0).toFixed(2)}`;
    }
    const scope = config.scope as Record<string, unknown> | undefined;
    const scopeLabel = scope?.type === 'category' ? ` in ${scope.category}` : '';
    if (config.rewardType === 'free_item') {
      const freeItem = config.freeItem as Record<string, unknown> | undefined;
      const itemLabel = describeSelectorForSummary({ scope: 'product', slug: freeItem?.slug, dosage: freeItem?.dosage });
      return `Spend £${Number(config.minSpend ?? 0).toFixed(2)}${scopeLabel}, get a free ${itemLabel}`;
    }
    return `Spend £${Number(config.minSpend ?? 0).toFixed(2)}${scopeLabel}, get ${config.rewardPercent}% off`;
  }

  async function loadPromotions() {
    try {
      const res = await fetch('/api/admin/promotions');
      const data = await res.json();
      if (res.ok) {
        setPromotions(data.promotions ?? []);
        setLoadError('');
      } else {
        setLoadError(data.error || 'Failed to load promotions.');
      }
    } catch {
      setLoadError('Failed to load promotions.');
    }
  }

  useEffect(() => {
    loadPromotions();
  }, []);

  function startEdit(row: PromotionRow) {
    setEditingId(row.id);
    setForm({
      title: row.title,
      description: row.description,
      buttonText: row.button_text ?? '',
      buttonLink: row.button_link ?? '',
      discountCode: row.discount_code ?? '',
      imageUrls: row.image_urls?.length ? row.image_urls : (row.image_url ? [row.image_url] : []),
      promotionType: row.promotion_type ?? 'informational',
      discountPercent: row.discount_percent !== null && row.discount_percent !== undefined ? String(row.discount_percent) : '10',
      discountScopeType: row.discount_scope_type ?? 'all',
      discountScopeCategories: row.discount_scope_categories ?? [],
      discountScopeProductSlugs: row.discount_scope_product_slugs ?? [],
      startDate: toDatetimeLocal(row.start_date),
      endDate: toDatetimeLocal(row.end_date),
      active: row.active,
    });
    setSaveMessage('');
    setSaveStatus('idle');
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSaveMessage('');
    setSaveStatus('idle');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim()) return;
    if (uploadingCount > 0) {
      setSaveStatus('error');
      setSaveMessage('Please wait for the image upload to finish before saving.');
      return;
    }

    const buttonLink = form.buttonLink.trim() || null;
    if (!isValidButtonLink(buttonLink)) {
      setSaveStatus('error');
      setSaveMessage('Button link must be a site path starting with "/" (e.g. /shop) or a full https:// URL.');
      return;
    }

    if (form.promotionType === 'code' && !form.discountCode.trim()) {
      setSaveStatus('error');
      setSaveMessage('A code promotion needs a discount code - switch to Informational if this offer has none.');
      return;
    }

    if (form.promotionType === 'percentage') {
      const pct = Number(form.discountPercent);
      if (!Number.isInteger(pct) || pct < 1 || pct > 100) {
        setSaveStatus('error');
        setSaveMessage('Percentage off must be a whole number between 1 and 100.');
        return;
      }
      if (form.discountScopeType === 'category' && form.discountScopeCategories.length === 0) {
        setSaveStatus('error');
        setSaveMessage('Select at least one category, or switch Applies To "All products".');
        return;
      }
      if (form.discountScopeType === 'product' && form.discountScopeProductSlugs.length === 0) {
        setSaveStatus('error');
        setSaveMessage('Select at least one product, or switch Applies To "All products".');
        return;
      }
    }

    setSaveStatus('loading');
    setSaveMessage('');

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      buttonText: form.buttonText.trim() || null,
      buttonLink,
      discountCode: form.discountCode.trim() || null,
      imageUrls: form.imageUrls,
      promotionType: form.promotionType,
      percentage: form.promotionType === 'percentage' ? Number(form.discountPercent) : null,
      scopeType: form.discountScopeType,
      scopeCategories: form.discountScopeCategories,
      scopeProductSlugs: form.discountScopeProductSlugs,
      startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
      endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
      active: form.active,
    };

    try {
      const res = await fetch(editingId ? `/api/admin/promotions/${editingId}` : '/api/admin/promotions', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        cancelEdit();
        loadPromotions();
      } else {
        setSaveStatus('error');
        setSaveMessage(data.error || 'Failed to save promotion.');
      }
    } catch {
      setSaveStatus('error');
      setSaveMessage('Failed to save promotion.');
    }
  }

  async function handleDelete(row: PromotionRow) {
    setDeleteConfirm(null);
    setDeleteId(row.id);
    try {
      const res = await fetch(`/api/admin/promotions/${row.id}`, { method: 'DELETE' });
      if (res.ok) {
        setPromotions(prev => prev?.filter(p => p.id !== row.id) ?? prev);
        if (editingId === row.id) cancelEdit();
      }
    } finally {
      setDeleteId(null);
    }
  }

  async function toggleActive(row: PromotionRow) {
    try {
      const res = await fetch(`/api/admin/promotions/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: row.title,
          description: row.description,
          buttonText: row.button_text,
          buttonLink: row.button_link,
          discountCode: row.discount_code,
          imageUrls: row.image_urls?.length ? row.image_urls : (row.image_url ? [row.image_url] : []),
          promotionType: row.promotion_type,
          percentage: row.discount_percent,
          scopeType: row.discount_scope_type,
          scopeCategories: row.discount_scope_categories,
          scopeProductSlugs: row.discount_scope_product_slugs,
          startDate: row.start_date,
          endDate: row.end_date,
          active: !row.active,
        }),
      });
      if (res.ok) {
        setPromotions(prev => prev?.map(p => p.id === row.id ? { ...p, active: !row.active } : p) ?? prev);
      }
    } catch {
      // ignore
    }
  }

  function statusFor(row: { active: boolean; start_date: string | null; end_date: string | null }): { label: string; tone: string } {
    if (!row.active) return { label: 'inactive', tone: 'bg-stone-100 text-stone-500' };
    const now = Date.now();
    if (row.start_date && new Date(row.start_date).getTime() > now) {
      return { label: 'scheduled', tone: 'bg-gold-50 text-gold-700' };
    }
    if (row.end_date && new Date(row.end_date).getTime() < now) {
      return { label: 'ended', tone: 'bg-stone-100 text-stone-500' };
    }
    return { label: 'live', tone: 'bg-green-50 text-green-700' };
  }

  function formatDate(value: string | null) {
    if (!value) return '-';
    return new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }


  return (
    <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
      {/* Sidebar */}
      <AdminSidebar />

      {/* Main */}
      <main className="flex-1 p-8 overflow-clip">
        <div className="max-w-4xl">
          <h1 className="text-lg font-semibold text-stone-800 mb-1">Promotions</h1>
          <p className="text-xs text-stone-500 mb-8">
            Manage every visible offer from one place - the homepage banner, automatic percentage discounts, and
            (below) automatic BOGO/bundle/spend-threshold rules.
          </p>

          {loadError && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-3 mb-6">
              {loadError}
            </div>
          )}

          <h2 className="text-base font-semibold text-stone-800 mb-1">Homepage Banner &amp; Percentage Discounts</h2>
          <p className="text-xs text-stone-500 mb-4">
            Only one active, in-date promotion is shown on the homepage banner at a time (whichever was created
            most recently). Percentage discount promotions also drive the Special Offers page and product pricing
            independently of which one wins that banner slot - at most one percentage discount can be active at
            once.
          </p>

          <PromotionForm
            form={form}
            setForm={setForm}
            editingId={editingId}
            handleSubmit={handleSubmit}
            cancelEdit={cancelEdit}
            saveStatus={saveStatus}
            saveMessage={saveMessage}
            allCategories={allCategories}
            discountProductSearch={discountProductSearch}
            setDiscountProductSearch={setDiscountProductSearch}
            discountProductCategoryFilter={discountProductCategoryFilter}
            setDiscountProductCategoryFilter={setDiscountProductCategoryFilter}
            discountFilteredProducts={discountFilteredProducts}
            discountPreviewProducts={discountPreviewProducts}
            handleUploadingChange={handleUploadingChange}
            uploadingCount={uploadingCount}
          />

          <PromotionsTable
            promotions={promotions}
            loadPromotions={loadPromotions}
            startEdit={startEdit}
            toggleActive={toggleActive}
            handleDelete={handleDelete}
            deleteId={deleteId}
            deleteConfirm={deleteConfirm}
            setDeleteConfirm={setDeleteConfirm}
            statusFor={statusFor}
            formatDate={formatDate}
          />

          <RuleForm
            ruleForm={ruleForm}
            setRuleForm={setRuleForm}
            setRuleType={setRuleType}
            editingRuleId={editingRuleId}
            handleRuleSubmit={handleRuleSubmit}
            cancelRuleEdit={cancelRuleEdit}
            ruleSaveStatus={ruleSaveStatus}
            ruleSaveMessage={ruleSaveMessage}
            rulesLoadError={rulesLoadError}
            addBundleItem={addBundleItem}
            removeBundleItem={removeBundleItem}
            updateBundleItem={updateBundleItem}
            products={products}
            allCategories={allCategories}
          />

          <RulesTable
            rules={rules}
            loadRules={loadRules}
            startRuleEdit={startRuleEdit}
            toggleRuleActive={toggleRuleActive}
            handleDeleteRule={handleDeleteRule}
            ruleDeleteId={ruleDeleteId}
            ruleDeleteConfirm={ruleDeleteConfirm}
            setRuleDeleteConfirm={setRuleDeleteConfirm}
            summarizeRule={summarizeRule}
            statusFor={statusFor}
          />
        </div>
      </main>
    </div>
  );
}
