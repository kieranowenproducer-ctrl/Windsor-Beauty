// Plain-text fallbacks for the admin Site Content editor (/admin/content).
//
// These mirror the hardcoded copy on each policy page (src/app/<page>/page.tsx)
// and the AnnouncementBar ticker. They exist purely so the admin editor opens
// pre-filled with the text that's actually live on the site, instead of an
// empty box, before any row exists in `site_content`. Saving here creates a
// `site_content` override which PolicyPage / AnnouncementBar then prefer.

export interface PolicyDefault {
  title: string;
  body: string;
}

export const DEFAULT_ANNOUNCEMENT_TEXT =
  'For Research Use Only  •  Not for Human Consumption  •  18+ Only  •  99% Purity  •  Lab Tested  •  Certificate of Analysis (COA) for all products are available on our website  • ';

const TERMS_BODY = `1. Who We Are

Windsor Glow is operated by C&S Holdings Group ("Windsor Glow", "we", "us", "our"). References to "you" or "the customer" mean the person browsing this site or placing an order with us.

2. Acceptance of These Terms

By entering this website, browsing our catalogue, creating an account, or placing an order, you confirm that you have read, understood, and agree to be bound by these Terms and Conditions, together with our Privacy Policy, Cookie Policy, Shipping Policy, Returns Policy, Product Disclaimer, Research Use Disclaimer, Payment Policy and Age Restriction Policy, each of which forms part of this agreement.

3. Eligibility to Use This Site

This website and the products listed on it are intended exclusively for laboratory and research use by adults. You confirm, by using this site, that you are at least 18 years of age and that you are accessing the site for legitimate research purposes, in line with our Age Restriction Policy.

4. Products and Descriptions

We take care to describe our products accurately, including purity figures and supporting documentation where applicable. However, product images, packaging and presentation may vary from those shown on the site. Please refer to our Product Disclaimer and Research Use Disclaimer for important information about the intended use of everything we sell.

5. Needle Usage Disclaimer

Where needles, syringes or other sharps are supplied with a product, whether included in the package or offered as a separate accessory, they are provided solely to support the lawful handling, mixing and reconstitution of research compounds within a controlled laboratory or research setting. They are not intended for human or animal use, and no representation is made that they are suitable, sterile, or approved for use on or in a human or animal body.

You are responsible for ensuring that the acquisition, storage, handling, use and disposal of any needles or sharps supplied with or alongside our products complies with the law in your jurisdiction, and for following appropriate sharps-handling and disposal procedures at all times.

6. Research Use Disclaimer

Not for Human or Animal Consumption. All products listed on this website are sold exclusively for in-vitro laboratory research and experimental use. They are not for human or animal consumption in any form, by any route, and must not be ingested, injected, inhaled, applied to the body, or otherwise introduced into a human or animal under any circumstances.

Sold to Qualified Researchers. By placing an order, you confirm that you are purchasing as a qualified individual or organisation conducting legitimate laboratory research, that you understand the handling and storage requirements of research compounds, and that you will use any product purchased from us solely within a controlled research environment.

No Endorsement of Other Use. Windsor Glow does not endorse, encourage, or condone the use of any product sold on this site for purposes other than laboratory research. Any reference material we provide, including our Dosage Guide and calculator, exists only to support consistent handling and reconstitution of compounds for research purposes, and carries no implication that the product is suitable, safe, or approved for any other use.

Compliance With Local Law. It is your responsibility to ensure that purchasing, possessing, and using any product from this site is lawful in your jurisdiction, and that you comply with any licensing, storage, or handling requirements that apply to research compounds where you are located.

Acceptance of This Disclaimer. By using this website and placing an order, you confirm that you have read and understood this Research Use Disclaimer and agree to be bound by it, alongside our Product Disclaimer, Age Restriction Policy, and Terms and Conditions.

7. Research Use and Medical Disclaimer

Every product listed on this website is supplied strictly for laboratory and scientific research purposes. None of our products are intended for human consumption, and they must not be ingested, injected, inhaled, applied to the body, or otherwise introduced into a human or animal under any circumstances.

Nothing we sell is intended to diagnose, treat, cure or prevent any disease, condition or ailment, and no product should be regarded as a medicine, supplement or therapeutic substance. Windsor Glow does not provide medical advice, and nothing on this website, including product descriptions, dosage information, or any supporting guides or calculators, should be read or relied upon as such. Where we do publish reference material of this kind, it exists solely to support the accurate handling and reconstitution of compounds within a controlled research environment, for informational purposes only.

You are responsible for satisfying yourself that purchasing, possessing and using any product from this site is lawful and appropriate in your circumstances and jurisdiction, and for ensuring it is handled only by suitably qualified persons in a proper research setting. If you have a medical question or concern, please seek guidance from a qualified healthcare professional rather than relying on anything published here. By entering this website, creating an account, or placing an order, you confirm that you understand and accept this disclaimer in full, in addition to our dedicated Research Use Disclaimer and Product Disclaimer.

8. Orders and Acceptance

Placing an order through this website is an offer by you to purchase the listed products. We may accept or decline that offer at our discretion, for example where stock is unavailable, where pricing has been displayed in error, or where we have reason to believe an order does not meet our eligibility requirements. A contract is only formed once we confirm that your order has been accepted and dispatched.

9. Pricing and Availability

All prices are shown in pounds sterling and are correct at the time of publishing, but may change without notice. We make every effort to ensure stock levels shown on the site are accurate; occasionally an item may become unavailable after you have placed an order, in which case we will contact you to discuss alternatives, a partial refund, or a full refund.

10. Your Account

If you create an account with us, you are responsible for keeping your login details confidential and for all activity that takes place under your account. Please let us know immediately if you believe your account has been accessed without your permission.

11. Intellectual Property

All content on this site, including text, graphics, logos, product photography and layout, belongs to Windsor Glow or its licensors and is protected by copyright and other intellectual property laws. You may view and print pages for your own personal reference, but may not reproduce, redistribute or otherwise commercially exploit any part of this site without our written permission.

12. Limitation of Liability

Nothing in these terms limits or excludes our liability where it would be unlawful to do so. Subject to that, we are not liable for any indirect or consequential loss arising from your use of this site or our products, including any loss arising from use of our products outside of the research purposes for which they are sold.

13. Changes to These Terms

We may update these terms from time to time to reflect changes in our business, our products, or relevant law. The version published on this page at the time you place an order is the version that applies to that order. We recommend checking this page periodically.

14. Governing Law

These terms are governed by the laws of England and Wales, and any disputes relating to them will be subject to the exclusive jurisdiction of the courts of England and Wales.`;

const PRIVACY_BODY = `Who We Are

Windsor Glow, operated by C&S Holdings Group, is the data controller responsible for the personal information described in this policy. Any questions about this policy or how your data is handled can be directed to our support team via the Contact page.

Information We Collect

We may collect and process the following types of information:

- Contact details you provide when creating an account, placing an order, verifying a product, or contacting us, such as your name, email address, delivery address and phone number.

- Order and transaction details, including the products you purchase and basic payment confirmation information (we do not store full card details, these are handled directly by our payment provider).

- Information submitted through our product verification system, including the verification code entered, the order number or email address provided, and basic technical information such as your IP address and device/browser type, used to protect the system from misuse.

- Marketing preferences, including whether you have opted in to receive offers or updates from us, and any discount codes issued to you.

- Technical and usage information collected automatically through cookies and similar technologies, as described in our Cookie Policy.

How We Use Your Information

We use personal information for purposes including:

- Processing and delivering your orders, and communicating with you about them.

- Operating and improving our product verification system, including preventing fraudulent or repeated misuse of verification codes.

- Managing your account and providing customer support.

- Sending you marketing communications, but only where you have given clear, separate consent to receive them, for example by ticking a consent box when signing up for a discount or verifying a product. We never add you to a marketing list without this consent.

- Meeting our legal, accounting and regulatory obligations.

Our Legal Basis for Processing

We rely on different legal grounds depending on the activity: performing our contract with you (for example, fulfilling an order), our legitimate interests (for example, preventing misuse of verification codes or improving our services), your consent (for example, marketing communications), and compliance with our legal obligations (for example, maintaining records for tax purposes).

How Long We Keep Information

We keep personal information for as long as necessary to fulfil the purposes described in this policy, including any legal, accounting or reporting requirements. Verification records are retained to maintain the integrity of our one-time-use code system and to support fraud prevention. You can ask us to review or delete your information at any time, subject to our legal obligations.

Sharing Your Information

We do not sell personal information. We may share it with trusted third parties who help us run our business, such as payment processors, delivery couriers, IT and hosting providers, and email or marketing platforms, and only to the extent needed for them to provide their service to us. These providers are required to keep your information secure and to use it only for the purposes we specify.

Keeping Your Information Secure

We use appropriate technical and organisational measures to protect personal information against unauthorised access, loss, misuse or alteration. Our verification system, for example, stores codes and usage records in a secured database rather than in publicly accessible files.

Your Rights

Depending on where you live, you may have rights to access, correct, delete, restrict or object to our use of your personal information, and to ask for a copy of it in a portable format. To exercise any of these rights, please contact our support team, we will respond as quickly as we can and in line with applicable law.

Changes to This Policy

We may update this policy from time to time to reflect changes in our practices or in the law. The version published on this page is the current version. We encourage you to review it periodically.`;

const SHIPPING_BODY = `Processing Times

Orders are typically processed and dispatched within one to two working days of payment being confirmed. Orders placed on weekends or UK public holidays are processed on the next working day. During exceptionally busy periods, processing may take slightly longer, if so, we will let you know.

Delivery Options and Timeframes

We currently offer two delivery options at checkout:

- UK Delivery (Royal Mail Tracked) for £10, typically 2 to 4 working days from dispatch.

- International Delivery (Royal Mail International Tracked) for £40, typically 7 to 14 working days from dispatch, depending on destination and customs processes.

These timeframes are estimates provided by our courier partners and are not guaranteed. Factors outside our control, including customs checks, courier delays and severe weather, can occasionally extend delivery times.

Shipping Costs

Shipping is charged at a flat rate of £10 for UK delivery and £40 for international delivery, shown in your basket and confirmed again at checkout before you complete your order.

Packaging

All orders are packed discreetly and securely to protect the contents in transit. Temperature-sensitive items are packed with appropriate materials where required. If you have any specific delivery instructions, please get in touch before placing your order and we will do our best to accommodate them.

Tracking Your Order

Once your order has been dispatched, we will send a confirmation email containing your tracking information where available. You can also check the status of your order at any time from your account dashboard.

International Orders

For deliveries outside the United Kingdom, please note that your order may be subject to import duties, taxes or customs charges levied by the destination country. These charges are the responsibility of the recipient and are not included in our shipping costs or product prices. We recommend checking with your local customs office before placing an international order.

Issues With Delivery

If your order has not arrived within the expected timeframe, or arrives damaged, please contact our support team with your order number as soon as possible so that we can investigate and put things right.`;

const RETURNS_BODY = `The Nature of Our Products

Windsor Glow supplies research compounds that are sealed, batch-referenced and supplied with supporting documentation such as a certificate of analysis. For reasons of safety, integrity and regulatory compliance, we are unable to accept returns of any product once its packaging or seal has been opened or tampered with.

Faulty or Incorrect Items

If you receive an item that is faulty, damaged in transit, or different from what you ordered, please contact us within 14 days of delivery with your order number, a description of the issue, and photographs where possible. We will investigate promptly and, where the issue is confirmed, arrange a replacement or refund at no additional cost to you.

Unopened, Unused Items

Where a product remains sealed, unused and in its original condition, we may at our discretion accept a return within 14 days of delivery. Please contact our support team before sending anything back, as items returned without prior agreement may not be eligible for a refund. Return postage costs in this situation are the responsibility of the customer unless the return is due to our error.

How to Start a Return or Report an Issue

To begin a return or report a problem with your order, please email our support team with your order number and a brief explanation of the issue, and we will guide you through the next steps.

Your Statutory Rights

Nothing in this policy affects your statutory rights as a consumer under applicable UK law. This policy should be read alongside our Terms and Conditions, Product Disclaimer and Refund Policy.`;

const REFUND_BODY = `Refunds

Approved refunds are issued to the original payment method used at checkout. Please allow up to 10 working days for the refund to appear in your account, depending on your bank or card provider's processing times.

Cancellations

If you wish to cancel an order, please contact us as soon as possible. If your order has not yet been dispatched, we will cancel it and issue a full refund. Once an order has been dispatched, the process set out in our Returns Policy for faulty, incorrect or unopened items will apply instead.

Your Statutory Rights

Nothing in this policy affects your statutory rights as a consumer under applicable UK law. This policy should be read alongside our Terms and Conditions, Returns Policy and Product Disclaimer.`;

export const POLICY_DEFAULTS: Record<string, PolicyDefault> = {
  'announcement-bar': { title: '', body: DEFAULT_ANNOUNCEMENT_TEXT },
  terms: { title: 'Terms and Conditions', body: TERMS_BODY },
  privacy: { title: 'Privacy Policy', body: PRIVACY_BODY },
  'shipping-policy': { title: 'Shipping Policy', body: SHIPPING_BODY },
  'returns-policy': { title: 'Returns Policy', body: RETURNS_BODY },
  'refund-policy': { title: 'Refund Policy', body: REFUND_BODY },
};
