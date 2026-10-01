'use client';

import { CampaignLeaflet, QRCodeDisplay } from './qrLazyComponents';
import {
  CAMPAIGN_TYPES,
  STATUS_STYLES,
  getTrackingUrl,
  formatDate,
  type Campaign,
  type CampaignStats,
  type CampaignMember,
  type CampaignGuest,
  type CampaignStatus,
  type Tab,
  type DetailTab,
} from './qrCampaignTypes';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  activeTab: Tab;
  loading: boolean;
  campaigns: Campaign[];
  filtered: Campaign[];
  stats: Record<number, CampaignStats>;
  search: string;
  setSearch: (value: string) => void;
  statusFilter: CampaignStatus | 'all';
  setStatusFilter: (value: CampaignStatus | 'all') => void;
  openCreate: () => void;
  openEdit: (campaign: Campaign) => void;
  selectCampaign: (c: Campaign) => void;
  selected: Campaign | null;
  selectedStats: CampaignStats | null;
  detailTab: DetailTab;
  setDetailTab: (value: DetailTab) => void;
  peopleLoading: boolean;
  campaignMembers: CampaignMember[];
  campaignGuests: CampaignGuest[];
  copiedSlug: string | null;
  copyUrl: (slug: string) => void;
  deleteConfirm: number | null;
  setDeleteConfirm: (value: number | null) => void;
  deleting: boolean;
  handleDelete: (id: number) => void;
  resetScansConfirm: number | null;
  setResetScansConfirm: (value: number | null) => void;
  resettingScans: boolean;
  handleResetScans: (id: number) => void;
}

export default function CampaignsTab({
  activeTab, loading, campaigns, filtered, stats, search, setSearch, statusFilter, setStatusFilter, openCreate, openEdit, selectCampaign, selected, selectedStats, detailTab, setDetailTab, peopleLoading, campaignMembers, campaignGuests, copiedSlug, copyUrl, deleteConfirm, setDeleteConfirm, deleting, handleDelete, resetScansConfirm, setResetScansConfirm, resettingScans, handleResetScans,
}: Props) {
  return (
    <>
          {/* ── CAMPAIGNS TAB ── */}
          {activeTab === 'campaigns' && (
            <>
              {/* Filters */}
              <div className="flex flex-wrap gap-2 mb-4">
                {(['all', 'active', 'paused', 'archived'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`text-[9px] tracking-[0.15em] uppercase px-3 py-1.5 border transition-colors ${
                      statusFilter === s
                        ? 'bg-gold-700 text-white border-gold-500'
                        : 'border-stone-200 text-stone-500 hover:border-gold-300 hover:text-gold-700'
                    }`}
                  >
                    {s === 'all' ? `All (${campaigns.length})` : `${s.charAt(0).toUpperCase() + s.slice(1)} (${campaigns.filter(c => c.status === s).length})`}
                  </button>
                ))}
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search campaigns..."
                  className="ml-auto border border-stone-200 focus:border-gold-400 outline-none px-3 py-1.5 text-xs text-stone-700 bg-white transition-colors w-44"
                />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
                {/* Campaign list */}
                <div className="xl:col-span-2 bg-white border border-stone-200 overflow-x-auto self-start">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-stone-100 bg-stone-50">
                        <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-500 px-4 py-3">Campaign</th>
                        <th className="text-right text-[9px] tracking-[0.18em] uppercase text-stone-500 px-4 py-3 hidden sm:table-cell">Scans</th>
                        <th className="text-right text-[9px] tracking-[0.18em] uppercase text-stone-500 px-4 py-3">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr><td colSpan={3} className="text-center text-xs text-stone-500 py-10">Loading…</td></tr>
                      ) : filtered.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="text-center py-10">
                            <p className="text-xs text-stone-500 mb-3">
                              {campaigns.length === 0 ? 'No campaigns yet.' : 'No campaigns match your filters.'}
                            </p>
                            {campaigns.length === 0 && (
                              <button onClick={openCreate} className="text-[9px] tracking-[0.18em] uppercase text-gold-700 hover:text-gold-700 transition-colors">
                                Create your first campaign
                              </button>
                            )}
                          </td>
                        </tr>
                      ) : filtered.map(c => {
                        const s = stats[c.id];
                        return (
                          <tr
                            key={c.id}
                            onClick={() => selectCampaign(c)}
                            className={`border-b border-stone-50 cursor-pointer transition-colors ${selected?.id === c.id ? 'bg-gold-50/40' : 'hover:bg-stone-50/50'}`}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className={`text-[7px] tracking-wider uppercase px-1.5 py-0.5 shrink-0 ${STATUS_STYLES[c.status]}`}>
                                  {c.status}
                                </span>
                                <span className="text-xs text-stone-700 font-medium truncate max-w-[140px]">{c.name}</span>
                              </div>
                              {c.partner_name && <div className="text-[9px] text-stone-500 mt-0.5">{c.partner_name}</div>}
                            </td>
                            <td className="px-4 py-3 text-right text-xs text-stone-500 hidden sm:table-cell">{s?.total_scans ?? 0}</td>
                            <td className="px-4 py-3 text-right text-xs font-semibold text-gold-700">
                              {s?.total_revenue ? `£${s.total_revenue.toFixed(2)}` : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Campaign detail panel */}
                <div className="xl:col-span-3">
                  {selected ? (
                    <div className="space-y-0">
                      {/* Header + sub-tab bar */}
                      <div className="bg-white border border-stone-200">
                        <div className="px-5 pt-5 pb-0">
                          <div className="flex items-start justify-between gap-2 mb-4">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                                <span className={`text-[7px] tracking-wider uppercase px-2 py-0.5 shrink-0 ${STATUS_STYLES[selected.status]}`}>
                                  {selected.status}
                                </span>
                                {selected.campaign_type && (
                                  <span className="text-[7px] tracking-wider uppercase px-2 py-0.5 bg-stone-50 text-stone-500 shrink-0">
                                    {CAMPAIGN_TYPES.find(t => t.value === selected.campaign_type)?.label ?? selected.campaign_type}
                                  </span>
                                )}
                              </div>
                              <h2 className="text-sm font-semibold text-stone-800 truncate">{selected.name}</h2>
                              {selected.partner_name && (
                                <p className="text-[9px] text-stone-500 mt-0.5">{selected.partner_name}</p>
                              )}
                              <p className="text-[9px] text-stone-300 mt-0.5">Created {formatDate(selected.created_at)}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => openEdit(selected)}
                                className="border border-stone-200 text-stone-500 text-[9px] tracking-[0.14em] uppercase px-3 py-1.5 hover:border-gold-300 hover:text-gold-700 transition-colors"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => setResetScansConfirm(resetScansConfirm === selected.id ? null : selected.id)}
                                className="border border-amber-100 text-amber-500 text-[9px] tracking-[0.14em] uppercase px-3 py-1.5 hover:border-amber-300 hover:text-amber-600 transition-colors"
                              >
                                Reset Scans
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(deleteConfirm === selected.id ? null : selected.id)}
                                className="border border-red-100 text-red-400 text-[9px] tracking-[0.14em] uppercase px-3 py-1.5 hover:border-red-300 hover:text-red-500 transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                          </div>

                          {/* Sub-tab bar */}
                          <div className="flex gap-0 -mb-px">
                            {(['overview', 'people', 'print'] as const).map(tab => (
                              <button
                                key={tab}
                                onClick={() => setDetailTab(tab)}
                                className={`text-[9px] tracking-[0.16em] uppercase px-4 py-2.5 border-b-2 transition-colors ${
                                  detailTab === tab
                                    ? 'border-gold-500 text-gold-700 font-semibold'
                                    : 'border-transparent text-stone-500 hover:text-stone-600'
                                }`}
                              >
                                {tab === 'overview' ? 'Overview' : tab === 'people' ? 'People' : 'Print'}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Reset scans confirm */}
                      {resetScansConfirm === selected.id && (
                        <div className="border border-amber-200 bg-amber-50 px-5 py-4">
                          <p className="text-[10px] text-amber-700 mb-3 leading-relaxed">
                            Reset the scan count to zero? This deletes all scan records for this campaign but leaves the campaign, orders, and customer attribution untouched.
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleResetScans(selected.id)}
                              disabled={resettingScans}
                              className="flex-1 bg-amber-500 text-white text-[9px] tracking-[0.18em] uppercase py-2 hover:bg-amber-600 transition-colors disabled:opacity-50"
                            >
                              {resettingScans ? 'Resetting…' : 'Confirm Reset'}
                            </button>
                            <button
                              onClick={() => setResetScansConfirm(null)}
                              className="flex-1 border border-stone-200 bg-white text-stone-500 text-[9px] tracking-[0.18em] uppercase py-2 hover:border-stone-300 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Delete confirm (shown inline below header) */}
                      {deleteConfirm === selected.id && (
                        <div className="border border-red-200 bg-red-50 px-5 py-4">
                          <p className="text-[10px] text-red-600 mb-3 leading-relaxed">
                            Delete this campaign permanently? Scan history and order attribution data will be lost.
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleDelete(selected.id)}
                              disabled={deleting}
                              className="flex-1 bg-red-500 text-white text-[9px] tracking-[0.18em] uppercase py-2 hover:bg-red-600 transition-colors disabled:opacity-50"
                            >
                              {deleting ? 'Deleting…' : 'Confirm Delete'}
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="flex-1 border border-stone-200 bg-white text-stone-500 text-[9px] tracking-[0.18em] uppercase py-2 hover:border-stone-300 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Overview tab */}
                      {detailTab === 'overview' && (
                        <div className="bg-white border border-stone-200 border-t-0 p-5 space-y-5">
                          {/* QR code + tracking info */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-start">
                            <div className="flex flex-col items-center">
                              <p className="text-[8px] tracking-widest uppercase text-stone-500 mb-2 self-start">QR Code</p>
                              <QRCodeDisplay url={getTrackingUrl(selected.slug)} slug={selected.slug} />
                            </div>
                            <div className="space-y-3">
                              <div>
                                <p className="text-[8px] tracking-widest uppercase text-stone-500 mb-1.5">Tracking Link</p>
                                <code className="block text-[9px] text-stone-600 bg-stone-50 border border-stone-100 px-2 py-1.5 font-mono mb-1.5 break-all">
                                  /r/{selected.slug}
                                </code>
                                <p className="text-[8px] text-stone-300 mb-2 leading-relaxed">
                                  Permanent link. Works even if you rename the campaign or change the destination.
                                </p>
                                <button
                                  onClick={() => copyUrl(selected.slug)}
                                  className="text-[9px] tracking-wider uppercase text-gold-700 hover:text-gold-700 border border-gold-200 hover:border-gold-400 px-3 py-1.5 transition-colors"
                                >
                                  {copiedSlug === selected.slug ? 'Copied!' : 'Copy Full URL'}
                                </button>
                              </div>
                              <div>
                                <p className="text-[8px] tracking-widest uppercase text-stone-500 mb-1">Destination</p>
                                <p className="text-[10px] text-stone-500 break-all">{selected.destination_url}</p>
                              </div>
                              {selected.discount_code && (
                                <div>
                                  <p className="text-[8px] tracking-widest uppercase text-stone-500 mb-1">Linked Code</p>
                                  <p className="text-xs font-mono text-stone-600">{selected.discount_code}</p>
                                </div>
                              )}
                              {selected.notes && (
                                <div>
                                  <p className="text-[8px] tracking-widest uppercase text-stone-500 mb-1">Notes</p>
                                  <p className="text-[10px] text-stone-500 leading-relaxed">{selected.notes}</p>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Performance stats */}
                          {selectedStats ? (
                            <div className="space-y-2 pt-4 border-t border-stone-100">
                              <p className="text-[8px] tracking-widest uppercase text-stone-500 mb-3">Performance</p>
                              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                {[
                                  { label: 'Scans', value: selectedStats.total_scans.toLocaleString() },
                                  { label: 'Unique', value: selectedStats.unique_visitors.toLocaleString() },
                                  { label: 'Signups', value: (selectedStats.total_signups ?? 0).toLocaleString() },
                                  { label: 'Orders', value: selectedStats.total_orders.toLocaleString() },
                                  { label: 'Revenue', value: `£${selectedStats.total_revenue.toFixed(2)}` },
                                ].map(({ label, value }) => (
                                  <div key={label} className="bg-stone-50 border border-stone-100 px-2.5 py-2.5 text-center">
                                    <p className="text-[7px] tracking-[0.2em] uppercase text-stone-500 mb-0.5">{label}</p>
                                    <p className="text-xs font-semibold text-stone-700">{value}</p>
                                  </div>
                                ))}
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {[
                                  { label: 'Conv. Rate', value: `${selectedStats.conversion_rate.toFixed(1)}%` },
                                  { label: 'Avg Order', value: selectedStats.avg_order_value > 0 ? `£${selectedStats.avg_order_value.toFixed(2)}` : '-' },
                                  { label: 'Rev / Scan', value: selectedStats.revenue_per_scan > 0 ? `£${selectedStats.revenue_per_scan.toFixed(2)}` : '-' },
                                ].map(({ label, value }) => (
                                  <div key={label} className="bg-stone-50 border border-stone-100 px-2.5 py-2.5 text-center">
                                    <p className="text-[7px] tracking-[0.2em] uppercase text-stone-500 mb-0.5">{label}</p>
                                    <p className="text-xs font-semibold text-stone-700">{value}</p>
                                  </div>
                                ))}
                              </div>
                              {(selectedStats.total_signups ?? 0) > 0 && (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                  {[
                                    { label: 'Rev / Signup', value: selectedStats.revenue_per_signup > 0 ? `£${selectedStats.revenue_per_signup.toFixed(2)}` : '-' },
                                    { label: 'Avg LTV', value: selectedStats.avg_customer_ltv > 0 ? `£${selectedStats.avg_customer_ltv.toFixed(2)}` : '-' },
                                    { label: 'Repeat Rate', value: selectedStats.repeat_purchase_rate > 0 ? `${selectedStats.repeat_purchase_rate.toFixed(1)}%` : '-' },
                                  ].map(({ label, value }) => (
                                    <div key={label} className="bg-gold-50 border border-gold-100 px-2.5 py-2.5 text-center">
                                      <p className="text-[7px] tracking-[0.2em] uppercase text-gold-400 mb-0.5">{label}</p>
                                      <p className="text-xs font-semibold text-gold-700">{value}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {/* Say what was left out, rather than quietly showing a smaller
                                  number. A figure that shrinks with no explanation is worse than
                                  the wrong figure, because there is no way to check it. */}
                              {(selectedStats.bot_scans ?? 0) > 0 && (
                                <p className="text-[9px] text-stone-500 pt-1">
                                  Not counted: {selectedStats.bot_scans} link {selectedStats.bot_scans === 1 ? 'preview' : 'previews'} or automatic
                                  {' '}{selectedStats.bot_scans === 1 ? 'check' : 'checks'}. When somebody sends this link in WhatsApp, WhatsApp
                                  fetches the page itself to draw the preview picture. Nobody opened it.
                                </p>
                              )}
                              {selectedStats.total_scans === 0 && (
                                <p className="text-[9px] text-stone-300 text-center pt-1">
                                  {(selectedStats.bot_scans ?? 0) > 0
                                    ? 'Nobody has opened this link yet. Share the QR code or tracking link to start recording data.'
                                    : 'No scans yet. Share the QR code or tracking link to start recording data.'}
                                </p>
                              )}
                            </div>
                          ) : (
                            <div className="pt-4 border-t border-stone-100">
                              <p className="text-[9px] text-stone-300 text-center py-4">No performance data yet.</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* People tab */}
                      {detailTab === 'people' && (
                        <div className="bg-white border border-stone-200 border-t-0">
                          {peopleLoading ? (
                            <p className="text-xs text-stone-500 text-center py-12">Loading…</p>
                          ) : (
                            <div>
                              {/* Members */}
                              <div className="px-5 py-5">
                                <div className="flex items-center gap-2 mb-4">
                                  <span className="w-2 h-2 rounded-full bg-gold-700 shrink-0" />
                                  <p className="text-[9px] tracking-[0.18em] uppercase text-stone-500 font-semibold">
                                    Members ({campaignMembers.length})
                                  </p>
                                  <p className="text-[9px] text-stone-300 ml-1">- created an account</p>
                                </div>
                                {campaignMembers.length === 0 ? (
                                  <p className="text-[10px] text-stone-300 ml-4">No account sign-ups from this campaign yet.</p>
                                ) : (
                                  <table className="w-full">
                                    <thead>
                                      <tr className="border-b border-stone-100">
                                        <th className="text-left text-[8px] tracking-wider uppercase text-stone-300 pb-2">Name</th>
                                        <th className="text-left text-[8px] tracking-wider uppercase text-stone-300 pb-2 hidden sm:table-cell">Joined</th>
                                        <th className="text-right text-[8px] tracking-wider uppercase text-stone-300 pb-2">Orders</th>
                                        <th className="text-right text-[8px] tracking-wider uppercase text-stone-300 pb-2">Lifetime</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {campaignMembers.map(m => (
                                        <tr key={m.id} className="border-b border-stone-50">
                                          <td className="py-2.5 pr-3">
                                            <p className="text-[10px] text-stone-700 font-medium">{(`${m.first_name ?? ''} ${m.last_name ?? ''}`.trim()) || m.email}</p>
                                            <p className="text-[9px] text-stone-500">{m.email}</p>
                                          </td>
                                          <td className="py-2.5 pr-3 hidden sm:table-cell">
                                            <p className="text-[9px] text-stone-500">{formatDate(m.created_at)}</p>
                                          </td>
                                          <td className="py-2.5 text-right text-[10px] text-stone-500">{m.order_count}</td>
                                          <td className="py-2.5 text-right text-[10px] font-semibold text-gold-700">
                                            {m.lifetime_spend > 0 ? `£${m.lifetime_spend.toFixed(2)}` : '-'}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>

                              <div className="border-t border-stone-100" />

                              {/* Guest buyers */}
                              <div className="px-5 py-5">
                                <div className="flex items-center gap-2 mb-4">
                                  <span className="w-2 h-2 rounded-full bg-stone-300 shrink-0" />
                                  <p className="text-[9px] tracking-[0.18em] uppercase text-stone-500 font-semibold">
                                    Guest Buyers ({campaignGuests.length})
                                  </p>
                                  <p className="text-[9px] text-stone-300 ml-1">- no account</p>
                                </div>
                                {campaignGuests.length === 0 ? (
                                  <p className="text-[10px] text-stone-300 ml-4">No guest purchases from this campaign yet.</p>
                                ) : (
                                  <table className="w-full">
                                    <thead>
                                      <tr className="border-b border-stone-100">
                                        <th className="text-left text-[8px] tracking-wider uppercase text-stone-300 pb-2">Email</th>
                                        <th className="text-left text-[8px] tracking-wider uppercase text-stone-300 pb-2 hidden sm:table-cell">Last Purchase</th>
                                        <th className="text-right text-[8px] tracking-wider uppercase text-stone-300 pb-2">Orders</th>
                                        <th className="text-right text-[8px] tracking-wider uppercase text-stone-300 pb-2">Spent</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {campaignGuests.map(g => (
                                        <tr key={g.email} className="border-b border-stone-50">
                                          <td className="py-2.5 pr-3">
                                            <p className="text-[10px] text-stone-700">{g.customer_name}</p>
                                            <p className="text-[9px] text-stone-500">{g.email}</p>
                                          </td>
                                          <td className="py-2.5 pr-3 hidden sm:table-cell">
                                            <p className="text-[9px] text-stone-500">{formatDate(g.last_order_at)}</p>
                                          </td>
                                          <td className="py-2.5 text-right text-[10px] text-stone-500">{g.order_count}</td>
                                          <td className="py-2.5 text-right text-[10px] font-semibold text-stone-600">
                                            {g.total_spend > 0 ? `£${g.total_spend.toFixed(2)}` : '-'}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Print tab */}
                      {detailTab === 'print' && (
                        <div className="bg-white border border-stone-200 border-t-0 px-5 py-5">
                          <CampaignLeaflet
                            trackingUrl={getTrackingUrl(selected.slug)}
                            slug={selected.slug}
                            campaignName={selected.name}
                            partnerName={selected.partner_name}
                            discountCode={selected.discount_code}
                            campaignId={selected.id}
                            bespokeTitle={selected.bespoke_title}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-white border border-stone-200 flex items-center justify-center h-48 text-center">
                      <div>
                        <p className="text-xs text-stone-300 mb-2">Select a campaign from the list</p>
                        <p className="text-[9px] text-stone-200">QR code, tracking link, stats and printable materials will appear here</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
    </>
  );
}
