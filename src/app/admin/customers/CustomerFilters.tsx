'use client';
import AdminStickyControls from '@/components/admin/AdminStickyControls';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  search: string;
  setSearch: (value: string) => void;
  marketingOnly: boolean;
  setMarketingOnly: (value: boolean) => void;
}

export default function CustomerFilters({
  search, setSearch, marketingOnly, setMarketingOnly,
}: Props) {
  return (
    <AdminStickyControls inset="p-4-sm-8">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 pb-3">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, email, or referral source..."
              className="border border-stone-200 focus:border-gold-400 outline-none px-3 py-2 text-sm text-stone-700 bg-white transition-colors w-full sm:w-96"
            />
            <label className="flex items-center gap-2 text-xs text-stone-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={marketingOnly}
                onChange={e => setMarketingOnly(e.target.checked)}
                className="accent-gold-500"
              />
              Marketing subscribers only
            </label>
          </div>
    </AdminStickyControls>
  );
}
