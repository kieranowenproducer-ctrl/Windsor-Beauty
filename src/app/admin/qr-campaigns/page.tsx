'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';

import CampaignsOverviewTab from './CampaignsOverviewTab';
import CampaignsTab from './CampaignsTab';
import CampaignFormModal from './CampaignFormModal';
import {
  DEFAULT_DESTINATION,
  detectPreset,
  EMPTY_FORM,
  getTrackingUrl,
  type CampaignStatus,
  type Tab,
  type DetailTab,
  type Campaign,
  type CampaignStats,
  type CampaignMember,
  type CampaignGuest,
} from './qrCampaignTypes';

export default function QrCampaignsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('campaigns');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [stats, setStats] = useState<Record<number, CampaignStats>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selected, setSelected] = useState<Campaign | null>(null);
  const [selectedStats, setSelectedStats] = useState<CampaignStats | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [campaignMembers, setCampaignMembers] = useState<CampaignMember[]>([]);
  const [campaignGuests, setCampaignGuests] = useState<CampaignGuest[]>([]);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [destinationPreset, setDestinationPreset] = useState(DEFAULT_DESTINATION);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [resetScansConfirm, setResetScansConfirm] = useState<number | null>(null);
  const [resettingScans, setResettingScans] = useState(false);

  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | 'all'>('all');
  const [search, setSearch] = useState('');

  // Analytics (overview tab)
  const [analyticsLoaded, setAnalyticsLoaded] = useState(false);
  const [scansTimeSeries, setScansTimeSeries] = useState<{ date: string; count: number }[]>([]);
  const [ordersTimeSeries, setOrdersTimeSeries] = useState<{ date: string; orders: number; revenue: number }[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/qr-campaigns');
      const data = await res.json();
      setCampaigns(Array.isArray(data.campaigns) ? data.campaigns : []);
      setStats(data.stats ?? {});
    } catch {
      setError('Could not load campaigns.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadAnalytics() {
    if (analyticsLoaded) return;
    try {
      const res = await fetch('/api/admin/qr-campaigns/analytics');
      const data = await res.json();
      setScansTimeSeries(data.scansTimeSeries ?? []);
      setOrdersTimeSeries(data.ordersTimeSeries ?? []);
      setAnalyticsLoaded(true);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (activeTab === 'overview') loadAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch the analytics when the Overview tab is opened, and only then. loadAnalytics is redefined every render, so including it would refetch continuously while the tab is open.
  }, [activeTab]);

  const filtered = campaigns.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.partner_name ?? '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Aggregated stats across all campaigns
  const totalScans = Object.values(stats).reduce((s, v) => s + v.total_scans, 0);
  const totalSignups = Object.values(stats).reduce((s, v) => s + (v.total_signups ?? 0), 0);
  const totalOrders = Object.values(stats).reduce((s, v) => s + v.total_orders, 0);
  const totalRevenue = Object.values(stats).reduce((s, v) => s + v.total_revenue, 0);
  const activeCampaignCount = campaigns.filter(c => c.status === 'active').length;

  // Top / bottom performers
  const rankedCampaigns = [...campaigns]
    .filter(c => stats[c.id]?.total_scans > 0 || stats[c.id]?.total_orders > 0)
    .sort((a, b) => (stats[b.id]?.total_revenue ?? 0) - (stats[a.id]?.total_revenue ?? 0));

  function openCreate() {
    setForm(EMPTY_FORM);
    setDestinationPreset(DEFAULT_DESTINATION);
    setIsEditing(false);
    setShowCreate(true);
    setSaveError('');
  }

  function openEdit(campaign: Campaign) {
    const preset = detectPreset(campaign.destination_url);
    setDestinationPreset(preset);
    setForm({
      name: campaign.name,
      status: campaign.status,
      partner_name: campaign.partner_name ?? '',
      campaign_type: campaign.campaign_type ?? '',
      destination_url: campaign.destination_url,
      discount_code: campaign.discount_code ?? '',
      notes: campaign.notes ?? '',
      start_date: campaign.start_date ?? '',
      end_date: campaign.end_date ?? '',
      bespoke_title: campaign.bespoke_title ?? '',
    });
    setIsEditing(true);
    setShowCreate(true);
    setSaveError('');
  }

  function handleDestinationPresetChange(value: string) {
    setDestinationPreset(value);
    if (value !== 'custom') {
      setForm(f => ({ ...f, destination_url: value }));
    } else {
      setForm(f => ({ ...f, destination_url: '' }));
    }
  }

  function selectCampaign(c: Campaign) {
    setSelected(c);
    setSelectedStats(stats[c.id] ?? null);
    setDetailTab('overview');
    setCampaignMembers([]);
    setCampaignGuests([]);
    setDeleteConfirm(null);
  }

  async function loadPeople(campaignId: number) {
    setPeopleLoading(true);
    try {
      const res = await fetch(`/api/admin/qr-campaigns/${campaignId}/customers`);
      const data = await res.json();
      setCampaignMembers(Array.isArray(data.members) ? data.members : []);
      setCampaignGuests(Array.isArray(data.guests) ? data.guests : []);
    } catch { /* ignore */ } finally {
      setPeopleLoading(false);
    }
  }

  useEffect(() => {
    if (detailTab === 'people' && selected && !peopleLoading && campaignMembers.length === 0 && campaignGuests.length === 0) {
      loadPeople(selected.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load the people for a campaign once, when the People tab is opened for it. loadPeople is redefined on every render, and the guard above already stops a second fetch.
  }, [detailTab, selected?.id]);

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    try {
      const payload = {
        name: form.name.trim(),
        status: form.status,
        partnerName: form.partner_name.trim() || null,
        campaignType: form.campaign_type || null,
        destinationUrl: form.destination_url.trim(),
        discountCode: form.discount_code.trim() || null,
        notes: form.notes.trim() || null,
        startDate: form.start_date || null,
        endDate: form.end_date || null,
        bespokeTitle: form.bespoke_title.trim() || null,
      };

      if (isEditing && selected) {
        const res = await fetch(`/api/admin/qr-campaigns/${selected.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update campaign.');
        setCampaigns(prev => prev.map(c => c.id === selected.id ? data.campaign : c));
        setSelected(data.campaign);
      } else {
        const res = await fetch('/api/admin/qr-campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create campaign.');
        setCampaigns(prev => [data.campaign, ...prev]);
        setSelected(data.campaign);
        setSelectedStats(null);
        setActiveTab('campaigns');
      }
      setShowCreate(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'An error occurred.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/qr-campaigns/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete campaign.');
      setCampaigns(prev => prev.filter(c => c.id !== id));
      if (selected?.id === id) setSelected(null);
      setDeleteConfirm(null);
    } catch {
      setError('Could not delete the campaign.');
    } finally {
      setDeleting(false);
    }
  }

  async function handleResetScans(id: number) {
    setResettingScans(true);
    try {
      const res = await fetch(`/api/admin/qr-campaigns/${id}/scans`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to reset scans.');
      setStats(prev => ({ ...prev, [id]: { ...(prev[id] ?? {}), total_scans: 0, unique_visitors: 0 } as typeof prev[typeof id] }));
      setResetScansConfirm(null);
    } catch {
      setError('Could not reset scan count.');
    } finally {
      setResettingScans(false);
    }
  }

  async function copyUrl(slug: string) {
    const url = getTrackingUrl(slug);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedSlug(slug);
      setTimeout(() => setCopiedSlug(null), 2000);
    } catch { /* clipboard unavailable */ }
  }

  return (
    <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
      <AdminSidebar />

      <main className="flex-1 p-8 overflow-clip">
        <div className="max-w-6xl">
          {/* Header */}
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold text-stone-800 mb-0.5">QR Campaign Tracking</h1>
              <p className="text-xs text-stone-400">
                Create campaigns, distribute QR codes, and track scans, orders and revenue by location.
              </p>
            </div>
            <button
              onClick={openCreate}
              className="shrink-0 bg-gold-700 text-white text-[9px] tracking-[0.18em] uppercase px-4 py-2.5 hover:bg-gold-800 transition-colors"
            >
              New Campaign
            </button>
          </div>

          {error && (
            <p className="text-[10px] text-red-400 border border-red-100 bg-red-50 px-3 py-1.5 mb-4">{error}</p>
          )}

          {/* Tab bar */}
          <div className="flex gap-0 mb-6 border-b border-stone-200">
            {([
              { id: 'campaigns', label: 'Campaigns' },
              { id: 'overview', label: 'Analytics Dashboard' },
            ] as { id: Tab; label: string }[]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`text-[9px] tracking-[0.18em] uppercase px-5 py-3 border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-gold-500 text-gold-700 font-semibold'
                    : 'border-transparent text-stone-400 hover:text-stone-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <CampaignsOverviewTab
            activeTab={activeTab}
            loading={loading}
            campaigns={campaigns}
            stats={stats}
            totalScans={totalScans}
            totalSignups={totalSignups}
            totalOrders={totalOrders}
            totalRevenue={totalRevenue}
            activeCampaignCount={activeCampaignCount}
            rankedCampaigns={rankedCampaigns}
            scansTimeSeries={scansTimeSeries}
            ordersTimeSeries={ordersTimeSeries}
            openCreate={openCreate}
          />

          <CampaignsTab
            activeTab={activeTab}
            loading={loading}
            campaigns={campaigns}
            filtered={filtered}
            stats={stats}
            search={search}
            setSearch={setSearch}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            openCreate={openCreate}
            openEdit={openEdit}
            selectCampaign={selectCampaign}
            selected={selected}
            selectedStats={selectedStats}
            detailTab={detailTab}
            setDetailTab={setDetailTab}
            peopleLoading={peopleLoading}
            campaignMembers={campaignMembers}
            campaignGuests={campaignGuests}
            copiedSlug={copiedSlug}
            copyUrl={copyUrl}
            deleteConfirm={deleteConfirm}
            setDeleteConfirm={setDeleteConfirm}
            deleting={deleting}
            handleDelete={handleDelete}
            resetScansConfirm={resetScansConfirm}
            setResetScansConfirm={setResetScansConfirm}
            resettingScans={resettingScans}
            handleResetScans={handleResetScans}
          />
        </div>
      </main>

      <CampaignFormModal
        showCreate={showCreate}
        setShowCreate={setShowCreate}
        isEditing={isEditing}
        form={form}
        setForm={setForm}
        selected={selected}
        destinationPreset={destinationPreset}
        handleDestinationPresetChange={handleDestinationPresetChange}
        handleSave={handleSave}
        saving={saving}
        saveError={saveError}
      />
    </div>
  );
}
