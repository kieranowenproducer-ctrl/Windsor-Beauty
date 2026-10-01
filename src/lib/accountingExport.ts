type AccountingOrder = {
  orderNumber: string;
  total: number;
  status: string;
  paymentConfirmedAt: string | null;
};

/** A restricted export for BRIAN. Customer names and addresses are never read. */
export function buildAccountingCsv(orders: AccountingOrder[], revenueStatuses: readonly string[]): string {
  const headings = ['Order number', 'Paid date', 'Gross', 'Payment fee', 'Refund', 'Product cost', 'Postage cost', 'Status'];
  const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const rows = orders.filter(order => order.paymentConfirmedAt).map(order => {
    if (!/^[A-Za-z0-9-]{3,80}$/.test(order.orderNumber) || !Number.isFinite(order.total) || order.total < 0) {
      throw new Error('An order has invalid accounting fields.');
    }
    const state = order.status === 'refunded' ? 'refunded'
      : revenueStatuses.includes(order.status) ? 'paid' : 'needs-review';
    const confirmed = new Date(order.paymentConfirmedAt as string);
    if (Number.isNaN(confirmed.getTime())) throw new Error('An order has an invalid payment date.');
    const paidDate = confirmed.toLocaleDateString('en-CA', {
      timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
    });
    return [
      order.orderNumber, paidDate, order.total.toFixed(2),
      // paypalFee is the surcharge collected from the customer and is already
      // included in total. It does not prove the processor's actual charge.
      '',
      state === 'paid' ? '0.00' : '', '', '', state,
    ].map(cell).join(',');
  });
  return [headings.map(cell).join(','), ...rows].join('\r\n');
}

export function accountingExportRange(params: URLSearchParams) {
  const from = params.get('from') || '';
  const to = params.get('to') || '';
  for (const name of ['from', 'to']) {
    const value = name === 'from' ? from : to;
    if (params.getAll(name).length > 1) throw new Error('Choose one date for each end of the range.');
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value + 'T00:00:00Z')) ||
      new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value)) throw new Error('Choose valid dates for the export.');
  }
  if (from && to && from > to) throw new Error('The To date is before the From date. Swap them over.');
  return { from, to, filename: `windsor-glow-accounting-${from || 'all'}-${to || 'latest'}.csv` };
}
