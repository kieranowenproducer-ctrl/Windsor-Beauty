'use client';

import { FULFILMENT_LABELS, STATUS_LABELS, STATUS_STYLES, formatDate, summariseItems, type Order } from './orderTypes';
import CustomerEmailButton from '@/components/admin/CustomerEmailButton';
import OrderStageSquare, { OrderStageKey } from '@/components/admin/OrderStageSquare';
import { describeParcelState } from '@/lib/royalMail';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  loading: boolean;
  orders: Order[];
  filtered: Order[];
  /** Order numbers on screen that came out of Archived orders because a search pulled them in. */
  archivedOnScreen: Set<string>;
  selectedOrder: Order | null;
  setSelectedOrder: (order: Order | null) => void;
  selectedIds: Set<string>;
  toggleSelect: (orderNumber: string) => void;
  toggleSelectAll: () => void;
  setDeleteConfirm: (value: string | null) => void;
}

export default function OrdersTable({
  loading, orders, filtered, archivedOnScreen, selectedOrder, setSelectedOrder,
  selectedIds, toggleSelect, toggleSelectAll, setDeleteConfirm,
}: Props) {
  return (
    <>
            {/* Orders table */}
            <div className="xl:col-span-2">
            {/* What the colours mean, above the list rather than in somebody's head. */}
            <OrderStageKey className="mb-3" />
            <div className="bg-white border border-stone-200 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-stone-100 bg-stone-50">
                    <th className="px-4 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={filtered.length > 0 && filtered.every(o => selectedIds.has(o.orderNumber))}
                        onChange={toggleSelectAll}
                        className="accent-gold-500"
                        aria-label="Select all orders"
                      />
                    </th>
                    {/* The stage square (task 41a3910f). First column after the tick box, because
                        the whole point of it is to be the thing you see without reading. */}
                    <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-500 px-2 py-3 w-6">
                      <span className="sr-only">Stage</span>
                    </th>
                    <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-500 px-4 py-3">Order</th>
                    <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-500 px-4 py-3">Customer</th>
                    <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-500 px-4 py-3">Total</th>
                    <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-500 px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="text-center text-xs text-stone-500 py-10">
                        Loading orders…
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center text-xs text-stone-500 py-10">
                        {orders.length === 0 ? 'No orders have been placed yet.' : 'No orders match your search.'}
                      </td>
                    </tr>
                  ) : filtered.map(order => (
                    <tr
                      key={order.orderNumber}
                      onClick={() => { setSelectedOrder(order); setDeleteConfirm(null); }}
                      className={`border-b border-stone-50 cursor-pointer transition-colors ${selectedOrder?.orderNumber === order.orderNumber ? 'bg-gold-50/40' : 'hover:bg-stone-50/50'}`}
                    >
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(order.orderNumber)}
                          onChange={() => toggleSelect(order.orderNumber)}
                          className="accent-gold-500"
                          aria-label={`Select order ${order.orderNumber}`}
                        />
                      </td>
                      <td className="px-2 py-3 align-top">
                        <OrderStageSquare order={order} className="mt-1" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-mono font-medium text-stone-700">{order.orderNumber}</span>
                          {/* Only ever appears on a search that reached into the archive, so the
                              row is not mistaken for something still to be done. */}
                          {archivedOnScreen.has(order.orderNumber) && (
                            <span className="text-[8px] tracking-[0.1em] uppercase text-stone-500 bg-stone-100 px-1.5 py-0.5">
                              Archived
                            </span>
                          )}
                        </div>
                        <div className="text-[9px] text-stone-500">{formatDate(order.createdAt)}</div>
                        <div className="text-[10px] text-stone-500 mt-1 leading-snug" title={summariseItems(order.items)}>
                          {summariseItems(order.items)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs text-stone-700">{order.customerName}</div>
                        <div className="text-[9px] text-stone-500">
                          <CustomerEmailButton email={order.email} customerName={order.customerName} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-gold-700">
                        &pound;{order.total.toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[8px] tracking-wider uppercase px-2 py-0.5 ${STATUS_STYLES[order.status] ?? 'bg-stone-50 text-stone-500'}`}>
                          {STATUS_LABELS[order.status] ?? order.status}
                        </span>
                        {(order.paymentMethod === 'paypal' || order.paymentMethod === 'fena') && (
                          <span className={`block text-[8px] tracking-wider mt-0.5 ${order.paymentMethod === 'paypal' ? 'text-[#0070ba]' : 'text-stone-500'}`}>
                            {order.paymentMethod === 'paypal' ? 'PayPal' : 'Pay by Bank'}
                          </span>
                        )}
                        {order.invoiceId && (
                          <span className="block text-[8px] tracking-wider uppercase text-gold-700 mt-0.5">Invoice Order</span>
                        )}
                        {order.fulfilmentType !== 'royal_mail' && (
                          <span className="block text-[8px] tracking-wider uppercase text-purple-500 mt-0.5">{FULFILMENT_LABELS[order.fulfilmentType]}</span>
                        )}
                        {/* What Royal Mail itself last said, if we have asked (task d912f632). Kept
                            plainly separate from the shop's own status above it, because the two can
                            disagree and that disagreement is the useful part: an order the shop calls
                            dispatched that Royal Mail never printed a label for. */}
                        {order.royalMailCheckedAt && order.fulfilmentType === 'royal_mail' && (
                          <span className="block text-[8px] text-stone-500 mt-1 leading-snug">
                            {describeParcelState({
                              printedOn: order.royalMailPrintedOn ?? null,
                              shippedOn: order.royalMailShippedOn ?? null,
                            })}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </div>
    </>
  );
}
