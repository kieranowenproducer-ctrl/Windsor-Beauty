import { sendPaypalInstructionsEmail, buildPaypalLink } from '../src/lib/paypalInstructionsEmail';

async function main() {
  const orderNumber = 'WB-TEST-0001';
  const total = 63.47;

  console.log('PAYPAL_ME_URL:', process.env.PAYPAL_ME_URL || '(not set)');
  console.log('PAYPAL_RECEIVING_EMAIL:', process.env.PAYPAL_RECEIVING_EMAIL || '(not set)');
  console.log('Resolved PayPal link:', buildPaypalLink(orderNumber, total));

  const result = await sendPaypalInstructionsEmail({
    to: 'kieranowenproducer@gmail.com',
    customerName: 'Test Customer',
    orderNumber,
    items: [
      { name: 'Sample Serum', variant: '30ml', price: 39.99, quantity: 1 },
      { name: 'Sample Cleanser', variant: '150ml', price: 24.99, quantity: 1 },
    ],
    subtotal: 64.98,
    discountCode: 'WELCOME10',
    discountAmount: 6.50,
    shippingLabel: 'UK Standard',
    shippingCost: 4.99,
    total,
  });

  console.log('Email send result:', result);
}

main();
