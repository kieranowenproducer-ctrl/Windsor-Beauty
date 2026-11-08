export interface ReportCursor { priority: number; at: string; key: string }

export function decodeReportCursor(value: string | null): ReportCursor | null {
  if (!value) return null;
  if (value.length > 600) throw new Error('Invalid page. Refresh the report.');
  try {
    const item = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (![0, 1].includes(item.priority) || typeof item.at !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(item.at)
      || !Number.isFinite(Date.parse(item.at)) || typeof item.key !== 'string'
      || !/^[a-z0-9-]{1,100}$/i.test(item.key)) throw new Error();
    // PostgreSQL keeps microseconds. Converting through Date would round down
    // the boundary and skip rows sharing the last page's millisecond.
    return { priority: item.priority, at: item.at, key: item.key };
  } catch { throw new Error('Invalid page. Refresh the report.'); }
}

export function encodeReportCursor(item: ReportCursor): string {
  return Buffer.from(JSON.stringify(item)).toString('base64url');
}

export const ACTIVITY_OUTSTANDING = ['pending', 'awaiting_payment', 'paid', 'awaiting_dispatch', 'processing', 'exported'];
export const REPORT_PAID_STATUSES = ['paid', 'awaiting_dispatch', 'processing', 'exported', 'dispatched', 'delivered'];
