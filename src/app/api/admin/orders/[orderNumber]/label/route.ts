import { NextResponse } from 'next/server';
import { findOrderByNumber, isDbConfigured } from '@/lib/db';
import { fetchShipmentLabel, isRoyalMailConfigured, type LabelDocumentType } from '@/lib/royalMail';

const VALID_DOCUMENT_TYPES: LabelDocumentType[] = ['postageLabel', 'despatchNote', 'CN22', 'CN23'];

// Streams a Royal Mail PDF document (postage label, despatch note, or
// CN22/CN23 customs declaration) for a dispatched order straight through to
// the browser so the admin can open/print it in one click — fetched live
// from Royal Mail each time rather than stored, since Click & Drop keeps the
// shipment on file and this avoids holding binary PDFs in Postgres.
//
// Query params: ?type=postageLabel|despatchNote|CN22|CN23 (default postageLabel)
export async function GET(request: Request, props: { params: Promise<{ orderNumber: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }
  if (!isRoyalMailConfigured()) {
    return NextResponse.json({ error: 'Royal Mail is not connected yet.' }, { status: 503 });
  }

  const order = await findOrderByNumber(params.orderNumber);
  if (!order || !order.royal_mail_order_id) {
    return NextResponse.json({ error: 'No shipping label has been generated for this order yet.' }, { status: 404 });
  }

  const requestedType = new URL(request.url).searchParams.get('type') || 'postageLabel';
  const documentType = (VALID_DOCUMENT_TYPES as string[]).includes(requestedType)
    ? requestedType as LabelDocumentType
    : 'postageLabel';

  try {
    const pdf = await fetchShipmentLabel(order.royal_mail_order_id, documentType);
    return new NextResponse(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${order.order_number}-${documentType}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Royal Mail could not return the document.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
