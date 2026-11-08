import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { previewBeautyCustomerMerge, executeBeautyCustomerMerge } from '@/lib/db/beautyCustomerMerge';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
function authorised(request: Request) {
  const expected = process.env.ADMIN_SESSION_TOKEN;
  const cookies = (request.headers.get('cookie') ?? '').split(';').map(v => v.trim());
  const matches = cookies.filter(v => v.startsWith('wb_admin_session='));
  const actual = matches.length === 1 ? matches[0].slice('wb_admin_session='.length) : '';
  if (!expected || !actual) return false;
  const left = Buffer.from(actual); const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
function failed(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('merge_not_found')) return reply({ error: 'Customer not found, or the email matches more than one account.' }, 404);
  if (message.includes('merge_invalid') || message.includes('merge_request_conflict')) return reply({ error: 'Invalid merge request. Preview the accounts again.' }, 400);
  if (message.includes('merge_blocked') || message.includes('merge_stale') || /lock timeout|deadlock|serialization/i.test(message)) {
    return reply({ error: 'The accounts changed or need review. Nothing was merged. Preview them again.' }, 409);
  }
  return reply({ error: 'Merge is unavailable. Check the account history before trying again.' }, 503);
}
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  if (!authorised(request)) return reply({ error: 'Sign in to the admin area again.' }, 401);
  try {
    const url = new URL(request.url);
    if (Array.from(url.searchParams.keys()).some(k => k !== 'other') || url.searchParams.getAll('other').length !== 1) return reply({ error: 'Enter one customer email or ID.' }, 400);
    return reply({ preview: await previewBeautyCustomerMerge(Number((await props.params).id), url.searchParams.get('other') ?? '') });
  } catch (error) { return failed(error); }
}
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  if (!authorised(request)) return reply({ error: 'Sign in to the admin area again.' }, 401);
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: 'Refresh this page before merging.' }, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return reply({ error: 'Send a JSON merge request.' }, 415);
  try {
    const raw = await request.text();
    if (raw.length > 2048) return reply({ error: 'Invalid merge request.' }, 400);
    const body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).sort().join(',') !== 'confirm,removeId,requestId,token' || body.confirm !== true) return reply({ error: 'Confirm the preview before merging.' }, 400);
    return reply({ result: await executeBeautyCustomerMerge(Number((await props.params).id), body.removeId, body.token, body.requestId) });
  } catch (error) { return failed(error); }
}
