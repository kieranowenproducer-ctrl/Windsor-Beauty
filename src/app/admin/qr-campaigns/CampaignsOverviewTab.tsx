'use client';

import { QrCharts } from './qrLazyComponents';
import type { Campaign, CampaignStats, Tab } from './qrCampaignTypes';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  activeTab: Tab;
  loading: boolean;
  campaigns: Campaign[];
  stats: Record<number, CampaignStats>;
  totalScans: number;
  totalSignups: number;
  totalOrders: number;
  totalRevenue: number;
  activeCampaignCount: number;
  rankedCampaigns: Campaign[];
  scansTimeSeries: { date: string; count: number }[];
  ordersTimeSeries: { date: string; orders: number; revenue: number }[];
  openCreate: () => void;
}

export default function CampaignsOverviewTab({
  activeTab, loading, campaigns, stats, totalScans, totalSignups, totalOrders, totalRevenue, activeCampaignCount, rankedCampaigns, scansTimeSeries, ordersTimeSeries, openCreate,
}: Props) {
  return (
    <>
          {/* ── OVERVIEW TAB ── */}
          {activeTab === 'overview' && (
            <div className="space-y-8">
              {/* Summary stat cards */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                {[
                  { label: 'Active Campaigns', value: activeCampaignCount.toString() },
                  { label: 'Total Scans', value: totalScans.toLocaleString() },
                  { label: 'Account Signups', value: totalSignups.toLocaleString() },
                  { label: 'QR Orders', value: totalOrders.toLocaleString() },
                  { label: 'QR Revenue', value: `£${totalRevenue.toFixed(2)}` },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white border border-stone-200 px-5 py-4">
                    <p className="text-[8px] tracking-[0.22em] uppercase text-stone-400 mb-1.5">{label}</p>
                    <p className="text-2xl font-semibold text-stone-800">{value}</p>
                  </div>
                ))}
              </div>

              {/* Attribution model info */}
              <div className="bg-stone-50 border border-stone-100 px-5 py-3 flex flex-wrap gap-4 text-[9px] text-stone-400 tracking-wider">
                <span><strong className="text-stone-600">Attribution:</strong> Last-touch, 30-day window</span>
                <span><strong className="text-stone-600">Unique visitors:</strong> Tracked via 365-day browser cookie</span>
                <span><strong className="text-stone-600">Order attribution:</strong> Independent of discount codes</span>
              </div>

              {/* Charts */}
              <div className="bg-white border border-stone-200 p-6">
                <p className="text-[8px] tracking-[0.22em] uppercase text-stone-400 mb-5">Campaign Performance Charts</p>
                <QrCharts
                  campaigns={campaigns}
                  stats={stats}
                  scansTimeSeries={scansTimeSeries}
                  ordersTimeSeries={ordersTimeSeries}
                />
              </div>

              {/* Top / Bottom performers */}
              {rankedCampaigns.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Top performers */}
                  <div className="bg-white border border-stone-200 overflow-x-auto">
                    <div className="px-5 py-3 border-b border-stone-100">
                      <p className="text-[8px] tracking-[0.22em] uppercase text-stone-400">Top Performers by Revenue</p>
                    </div>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-stone-50">
                          <th className="text-left text-[8px] tracking-wider uppercase text-stone-300 px-5 py-2">Campaign</th>
                          <th className="text-right text-[8px] tracking-wider uppercase text-stone-300 px-4 py-2">Scans</th>
                          <th className="text-right text-[8px] tracking-wider uppercase text-stone-300 px-4 py-2">Orders</th>
                          <th className="text-right text-[8px] tracking-wider uppercase text-stone-300 px-4 py-2">Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rankedCampaigns.slice(0, 5).map(c => (
                          <tr key={c.id} className="border-b border-stone-50">
                            <td className="px-5 py-2.5">
                              <p className="text-xs text-stone-700 font-medium">{c.name}</p>
                              {c.partner_name && <p className="text-[9px] text-stone-400">{c.partner_name}</p>}
                            </td>
                            <td className="text-right text-xs text-stone-500 px-4 py-2.5">{stats[c.id]?.total_scans ?? 0}</td>
                            <td className="text-right text-xs text-stone-500 px-4 py-2.5">{stats[c.id]?.total_orders ?? 0}</td>
                            <td className="text-right text-xs font-semibold text-gold-700 px-4 py-2.5">
                              £{(stats[c.id]?.total_revenue ?? 0).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Needs attention — lowest conversion */}
                  <div className="bg-white border border-stone-200 overflow-x-auto">
                    <div className="px-5 py-3 border-b border-stone-100">
                      <p className="text-[8px] tracking-[0.22em] uppercase text-stone-400">Needs Attention (Most Scans, Fewest Orders)</p>
                    </div>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-stone-50">
                          <th className="text-left text-[8px] tracking-wider uppercase text-stone-300 px-5 py-2">Campaign</th>
                          <th className="text-right text-[8px] tracking-wider uppercase text-stone-300 px-4 py-2">Scans</th>
                          <th className="text-right text-[8px] tracking-wider uppercase text-stone-300 px-4 py-2">Orders</th>
                          <th className="text-right text-[8px] tracking-wider uppercase text-stone-300 px-4 py-2">Conv.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...rankedCampaigns]
                          .filter(c => (stats[c.id]?.total_scans ?? 0) > 0)
                          .sort((a, b) => (stats[a.id]?.conversion_rate ?? 0) - (stats[b.id]?.conversion_rate ?? 0))
                          .slice(0, 5)
                          .map(c => (
                            <tr key={c.id} className="border-b border-stone-50">
                              <td className="px-5 py-2.5">
                                <p className="text-xs text-stone-700 font-medium">{c.name}</p>
                                {c.partner_name && <p className="text-[9px] text-stone-400">{c.partner_name}</p>}
                              </td>
                              <td className="text-right text-xs text-stone-500 px-4 py-2.5">{stats[c.id]?.total_scans ?? 0}</td>
                              <td className="text-right text-xs text-stone-500 px-4 py-2.5">{stats[c.id]?.total_orders ?? 0}</td>
                              <td className="text-right text-xs text-stone-500 px-4 py-2.5">
                                {(stats[c.id]?.conversion_rate ?? 0).toFixed(1)}%
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                    {rankedCampaigns.filter(c => (stats[c.id]?.total_scans ?? 0) > 0).length === 0 && (
                      <p className="text-xs text-stone-300 text-center py-6">No scan data yet</p>
                    )}
                  </div>
                </div>
              )}

              {campaigns.length === 0 && !loading && (
                <div className="bg-white border border-stone-200 p-12 text-center">
                  <p className="text-xs text-stone-400 mb-4">No campaigns yet. Create one to start tracking QR code performance.</p>
                  <button onClick={openCreate} className="bg-gold-700 text-white text-[9px] tracking-[0.18em] uppercase px-4 py-2.5 hover:bg-gold-800 transition-colors">
                    Create First Campaign
                  </button>
                </div>
              )}
            </div>
          )}
    </>
  );
}
