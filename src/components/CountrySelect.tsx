// Shared ISO-3166 country list — used by checkout's delivery address AND the
// admin invoice builder's billing/shipping addresses. Values are codes (e.g.
// "GB"), never display labels: src/lib/royalMailDispatch.ts's international
// detection is a strict `countryCode !== 'GB'` check, so anything that stores
// a country here must store the code, not "United Kingdom" as free text.
export interface CountryOption {
  code: string;
  label: string;
  group: string;
}

export const COUNTRY_OPTIONS: CountryOption[] = [
  { code: 'GB', label: 'United Kingdom', group: 'United Kingdom' },
  { code: 'IE', label: 'Ireland', group: 'Europe' },
  { code: 'AT', label: 'Austria', group: 'Europe' },
  { code: 'BE', label: 'Belgium', group: 'Europe' },
  { code: 'BG', label: 'Bulgaria', group: 'Europe' },
  { code: 'HR', label: 'Croatia', group: 'Europe' },
  { code: 'CY', label: 'Cyprus', group: 'Europe' },
  { code: 'CZ', label: 'Czech Republic', group: 'Europe' },
  { code: 'DK', label: 'Denmark', group: 'Europe' },
  { code: 'EE', label: 'Estonia', group: 'Europe' },
  { code: 'FI', label: 'Finland', group: 'Europe' },
  { code: 'FR', label: 'France', group: 'Europe' },
  { code: 'DE', label: 'Germany', group: 'Europe' },
  { code: 'GR', label: 'Greece', group: 'Europe' },
  { code: 'HU', label: 'Hungary', group: 'Europe' },
  { code: 'IT', label: 'Italy', group: 'Europe' },
  { code: 'LV', label: 'Latvia', group: 'Europe' },
  { code: 'LT', label: 'Lithuania', group: 'Europe' },
  { code: 'LU', label: 'Luxembourg', group: 'Europe' },
  { code: 'MT', label: 'Malta', group: 'Europe' },
  { code: 'NL', label: 'Netherlands', group: 'Europe' },
  { code: 'NO', label: 'Norway', group: 'Europe' },
  { code: 'PL', label: 'Poland', group: 'Europe' },
  { code: 'PT', label: 'Portugal', group: 'Europe' },
  { code: 'RO', label: 'Romania', group: 'Europe' },
  { code: 'SK', label: 'Slovakia', group: 'Europe' },
  { code: 'SI', label: 'Slovenia', group: 'Europe' },
  { code: 'ES', label: 'Spain', group: 'Europe' },
  { code: 'SE', label: 'Sweden', group: 'Europe' },
  { code: 'CH', label: 'Switzerland', group: 'Europe' },
  { code: 'CA', label: 'Canada', group: 'Americas' },
  { code: 'MX', label: 'Mexico', group: 'Americas' },
  { code: 'US', label: 'United States', group: 'Americas' },
  { code: 'AU', label: 'Australia', group: 'Asia-Pacific' },
  { code: 'JP', label: 'Japan', group: 'Asia-Pacific' },
  { code: 'NZ', label: 'New Zealand', group: 'Asia-Pacific' },
  { code: 'SG', label: 'Singapore', group: 'Asia-Pacific' },
  { code: 'AE', label: 'United Arab Emirates', group: 'Middle East' },
  { code: 'SA', label: 'Saudi Arabia', group: 'Middle East' },
  { code: 'OTHER', label: 'Other', group: 'Other' },
];

const GROUP_ORDER = ['United Kingdom', 'Europe', 'Americas', 'Asia-Pacific', 'Middle East', 'Other'];

// `id` is optional but every caller should pass one: without it the visible
// "Country" caption above the box is just text sitting nearby, so a screen
// reader announces the dropdown with no name at all and the person filling in
// a delivery address cannot tell what it is for.
export default function CountrySelect({
  value,
  onChange,
  className,
  id,
  disabled,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  className?: string;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <select id={id} value={value} onChange={onChange} className={className} disabled={disabled}>
      {GROUP_ORDER.map((group) => (
        <optgroup key={group} label={group}>
          {COUNTRY_OPTIONS.filter((o) => o.group === group).map((o) => (
            <option key={o.code} value={o.code}>{o.label}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
