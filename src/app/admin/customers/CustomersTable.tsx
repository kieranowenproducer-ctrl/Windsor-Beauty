'use client';

import Link from 'next/link';
import { customerDisplayName, formatDate, type Customer, type SortField, type SortDir } from './customerTypes';
import CustomerEmailButton from '@/components/admin/CustomerEmailButton';
// The rule for "where did this customer come from" moved into its own file when the
// verification cards above this table needed to say the same thing (task c61b59f4).
// Both screens read it from there so they cannot drift apart.
import { cameFrom } from './cameFrom';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  loading: boolean;
  customers: Customer[];
  filtered: Customer[];
  selected: Customer | null;
  selectCustomer: (c: Customer) => void;
  sortField: SortField;
  sortDir: SortDir;
  handleSort: (field: SortField) => void;
}

export default function CustomersTable({
  loading, customers, filtered, selected, selectCustomer, sortField, sortDir, handleSort,
}: Props) {
  return (
    <>
            {/* Customers table */}
            <div className="xl:col-span-2 bg-white border border-stone-200 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-stone-100 bg-stone-50">
                    {([
                      { label: 'Customer', field: 'name' as SortField },
                      { label: 'Came From', field: null },
                      /* When they joined (task c8a24371). The date was already held and already
                         sortable, and already went into the exported list as "Registered". It was
                         simply never shown, so the one question the screen could not answer was
                         "when did this person come to us". */
                      { label: 'Joined', field: 'joined' as SortField },
                      { label: 'Orders', field: 'orderCount' as SortField },
                      { label: 'Total Spent', field: 'totalSpent' as SortField },
                      { label: 'Last Order', field: 'lastOrder' as SortField },
                      { label: 'Discount Code', field: null },
                      { label: 'Marketing', field: null },
                    ] as { label: string; field: SortField | null }[]).map(({ label, field }) => (
                      <th
                        key={label}
                        className={`text-left text-[9px] tracking-[0.18em] uppercase text-stone-400 px-2.5 py-2.5 whitespace-nowrap ${field ? 'cursor-pointer select-none hover:text-gold-700 transition-colors' : ''}`}
                        onClick={() => field && handleSort(field)}
                      >
                        {label}
                        {field && sortField === field && (
                          <span className="ml-1 text-gold-700">{sortDir === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="text-center text-xs text-stone-400 py-10">
                        Loading customers…
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center text-xs text-stone-400 py-10">
                        {customers.length === 0 ? 'No customer accounts yet.' : 'No customers match your search.'}
                      </td>
                    </tr>
                  ) : filtered.map(customer => (
                    <tr
                      key={customer.id}
                      onClick={() => selectCustomer(customer)}
                      className={`border-b border-stone-50 cursor-pointer transition-colors ${selected?.id === customer.id ? 'bg-gold-50/40' : 'hover:bg-stone-50/50'}`}
                    >
                      <td className="px-2.5 py-2.5 max-w-[160px]">
                        <div className="flex items-center gap-1.5">
                          <Link
                            href={`/admin/customers/${customer.id}`}
                            onClick={e => e.stopPropagation()}
                            className="text-xs text-stone-700 truncate hover:text-gold-700 transition-colors"
                          >
                            {customerDisplayName(customer)}
                          </Link>
                          {customer.bannedAt && (
                            <span className="shrink-0 inline-flex items-center text-[8px] tracking-[0.1em] uppercase px-1.5 py-0.5 bg-red-50 text-red-600 border border-red-200">Banned</span>
                          )}
                          {customer.accountStatus === 'pending_password' && (
                            <span className="shrink-0 inline-flex items-center text-[8px] tracking-[0.1em] uppercase px-1.5 py-0.5 bg-amber-50 text-amber-600 border border-amber-200">Pending</span>
                          )}
                        </div>
                        <div className="text-[9px] text-stone-400 truncate">
                          <CustomerEmailButton email={customer.email} customerName={customerDisplayName(customer)} />
                        </div>
                      </td>
                      <td className="px-2.5 py-2.5">
                        {(() => {
                          const from = cameFrom(customer);
                          return (
                            <div title={from.detail ? `${from.main} (${from.detail})` : from.main}>
                              <div className={`text-[9px] font-medium max-w-[130px] ${from.known ? 'text-gold-700' : 'text-stone-300'}`}>
                                {from.main}
                              </div>
                              {from.detail && (
                                <div className="text-[8px] text-stone-400 truncate max-w-[130px]">{from.detail}</div>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-2.5 py-2.5 text-[9px] text-stone-400 whitespace-nowrap">{formatDate(customer.createdAt)}</td>
                      <td className="px-2.5 py-2.5 text-xs text-stone-600">{customer.orderCount}</td>
                      <td className="px-2.5 py-2.5 text-xs font-semibold text-gold-700 whitespace-nowrap">
                        &pound;{customer.totalSpent.toFixed(2)}
                      </td>
                      <td className="px-2.5 py-2.5 text-[9px] text-stone-400 whitespace-nowrap">{formatDate(customer.lastOrderAt)}</td>
                      <td className="px-2.5 py-2.5">
                        {customer.discountCode ? (
                          <div className="space-y-0.5">
                            <div className="font-mono text-[9px] text-gold-700 whitespace-nowrap">{customer.discountCode}</div>
                            <span className={`inline-block text-[8px] tracking-wider uppercase px-1.5 py-0.5 whitespace-nowrap ${customer.discountCodeStatus === 'used' ? 'bg-green-50 text-green-600' : 'bg-stone-100 text-stone-400'}`}>
                              {customer.discountCodeStatus === 'used' ? 'Redeemed' : 'Unredeemed'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[9px] text-stone-300">—</span>
                        )}
                      </td>
                      <td className="px-2.5 py-2.5">
                        <span className={`text-[8px] tracking-wider uppercase px-2 py-0.5 whitespace-nowrap ${customer.marketingConsent ? 'bg-green-50 text-green-600' : 'bg-stone-100 text-stone-400'}`}>
                          {customer.marketingConsent ? 'Yes' : 'No'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
    </>
  );
}
