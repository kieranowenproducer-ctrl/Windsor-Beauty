// This inherited launch feature is already retired by the unchanged proxy.
// Refuse direct handler calls too: arbitrary tests/bulk repeats cannot bypass the once-only member notice.
// Discount issuance in normal registration/account flows remains unchanged.
export const dynamic = 'force-dynamic';
export async function POST() {
 return Response.json({ error: 'The inherited launch send is retired. Use the separately reviewed member changeover notice.' },
  { status: 409, headers: { 'Cache-Control': 'private, no-store' } });
}
