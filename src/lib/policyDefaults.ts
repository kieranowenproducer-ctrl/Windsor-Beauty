// Plain-text fallbacks for the admin Site Content editor (/admin/content).
//
// These mirror the hardcoded copy on each policy page (src/app/<page>/page.tsx)
// and the AnnouncementBar ticker. They exist purely so the admin editor opens
// pre-filled with the text that's actually live on the site, instead of an
// empty box, before any row exists in `site_content`. Saving here creates a
// `site_content` override which PolicyPage / AnnouncementBar then prefer.
//
// The delivery windows in SHIPPING_BODY must match `src/lib/shippingWindows.ts`;
// `npm run check:shipping` reads this file and fails if they drift.

export interface PolicyDefault {
  title: string;
  body: string;
}

export const DEFAULT_ANNOUNCEMENT_TEXT =
  'Premium Skincare  •  Tracked UK Delivery  •  Patch Test Before First Use  •  For External Use Only  • ';

const TERMS_BODY = `1. Who We Are

Windsor Beauty is operated by C&S Holdings Group ("Windsor Beauty", "we", "us", "our"). References to "you" or "the customer" mean the person browsing this site or placing an order with us.

2. Acceptance of These Terms

By browsing our shop, creating an account, or placing an order, you agree to these Terms and Conditions, together with our Privacy Policy, Cookie Policy, Shipping Policy, Returns Policy, Refund Policy, Payment Policy and Product Disclaimer, each of which forms part of this agreement.

3. Our Products

We sell skincare and other cosmetic products. They are for external use only and should be used as directed on the packaging. They are not medicines.

Skin differs from person to person. We recommend a patch test before you use a product for the first time. If irritation occurs, stop using the product. Please read our Product Disclaimer for more detail.

4. Product Descriptions

We take care to describe and photograph our products accurately. Colours can look a little different from one screen to another, and packaging may be updated from time to time. Please check the ingredient list on the product page and on the packaging before use, particularly if you have a known allergy or sensitivity.

5. No Medical Advice

Nothing on this website is medical advice. Our products are not intended to diagnose, treat, cure or prevent any disease or medical condition. If you have a skin condition or a medical concern, or you are unsure whether a product is suitable for you, please speak to a pharmacist, doctor or dermatologist.

6. Orders and Acceptance

Placing an order through this website is an offer by you to buy the listed products. We may decline an order, for example where an item is out of stock or a price has been shown in error. If we do, we will tell you and refund anything you have paid. A contract is formed once we confirm that your order has been accepted and dispatched.

7. Pricing and Availability

All prices are shown in pounds sterling. Prices may change, but a change will not affect an order we have already accepted. We make every effort to keep stock levels accurate. Occasionally an item may become unavailable after you have ordered, in which case we will contact you to offer an alternative or a refund.

8. Your Right to Cancel

If you are a consumer buying online, the Consumer Contracts Regulations 2013 give you 14 days from the day you receive your order to change your mind and cancel. For hygiene reasons, this right does not apply to sealed cosmetic products once they have been opened or unsealed after delivery. Our Returns Policy explains how to cancel and how refunds work.

9. Faulty or Wrongly Described Items

Under the Consumer Rights Act 2015, the products we sell must be as described, of satisfactory quality and fit for purpose. If an item arrives faulty, damaged or not as described, please contact us and we will put it right. Nothing in these terms affects your statutory rights.

10. Your Account

If you create an account with us, you are responsible for keeping your login details confidential and for activity that takes place under your account. Please let us know straight away if you believe your account has been accessed without your permission.

11. Intellectual Property

All content on this site, including text, graphics, logos, product photography and layout, belongs to Windsor Beauty or its licensors and is protected by copyright and other intellectual property laws. You may view and print pages for your own personal reference, but may not reproduce, redistribute or commercially exploit any part of this site without our written permission.

12. Customer Reviews

Reviews published on this site are written by customers and reflect their personal opinions and experiences. They are not statements, claims or endorsements by Windsor Beauty. Results vary from person to person, and nothing in a customer review should be read as a claim by us about what any product does.

If you leave a review, you confirm that it is your own genuine and honest opinion, that you have actually purchased or used the product you are reviewing, and that you have not been paid or otherwise rewarded for writing it. You must not submit anything unlawful, offensive, misleading, or that infringes somebody else's rights, and you must not claim that a product treats, cures or prevents any medical condition.

Reviews are checked before they appear, and we may decline to publish, edit for length or clarity, or remove any review at our discretion, including where it does not meet the requirements above. By submitting a review you give us permission to publish it on this site and in our own marketing, together with your first name and the initial of your surname. You keep ownership of what you write. If you would like a review of yours removed, please contact us.

13. Limitation of Liability

Nothing in these terms limits or excludes our liability where it would be unlawful to do so. This includes liability for death or personal injury caused by our negligence, for fraud, and for breach of your statutory rights as a consumer. Subject to that, we are not liable for losses that were not foreseeable when the contract was made, or for losses arising from a product being used other than as directed.

14. Changes to These Terms

We may update these terms from time to time to reflect changes in our business, our products, or relevant law. The version published on this page at the time you place an order is the version that applies to that order.

15. Governing Law

These terms are governed by the laws of England and Wales. Disputes may be brought in the courts of England and Wales. If you live in Scotland or Northern Ireland, you may also bring proceedings in the courts there.`;

const PRIVACY_BODY = `Who We Are

Windsor Beauty, operated by C&S Holdings Group, is the data controller responsible for the personal information described in this policy. Any questions about this policy or how your data is handled can be directed to our support team via the Contact page.

Information We Collect

We may collect and process the following types of information:

- Contact details you provide when creating an account, placing an order or contacting us, such as your name, email address, delivery address and phone number.

- Order and payment details, including the products you buy and confirmation that a payment was made. Payments are completed with the payment provider you choose at checkout. We do not receive or store your card or bank login details.

- Reviews, messages and other content you choose to send us.

- Marketing preferences, including whether you have opted in to receive offers or updates from us, and any discount codes issued to you.

- Technical and usage information, such as your IP address, device and browser type and the pages you visit, collected through cookies and similar technologies as described in our Cookie Policy.

How We Use Your Information

We use personal information to:

- Process and deliver your orders, and keep you updated about them.

- Manage your account and provide customer support.

- Understand how the shop is used so that we can fix problems and improve it.

- Keep the site secure and prevent fraud or misuse.

- Send you marketing emails, but only where you have clearly agreed to receive them. You can unsubscribe at any time using the link in any marketing email.

- Meet our legal, accounting and regulatory obligations.

Our Legal Basis for Processing

Under UK data protection law (the UK GDPR and the Data Protection Act 2018), we rely on different legal grounds depending on the activity: performing our contract with you (for example, fulfilling an order), our legitimate interests (for example, keeping the site secure and improving our service), your consent (for example, marketing emails), and compliance with our legal obligations (for example, keeping records for tax purposes).

How Long We Keep Information

We keep personal information only for as long as we need it for the purposes described in this policy, including any legal, accounting or reporting requirements. You can ask us to review or delete your information at any time, subject to our legal obligations.

Sharing Your Information

We do not sell personal information. We share it only with trusted providers who help us run the shop, such as payment providers, delivery couriers, website hosting and IT providers, and email services, and only to the extent they need it to provide their service to us. Some of these providers may process information outside the United Kingdom. Where they do, we rely on the safeguards that UK data protection law requires.

Keeping Your Information Secure

We use appropriate technical and organisational measures to protect personal information against unauthorised access, loss, misuse or alteration.

Your Rights

You have the right to ask for a copy of your personal information, to have it corrected or deleted, to restrict or object to how we use it, to receive it in a portable format, and to withdraw consent to marketing at any time. To use any of these rights, please contact our support team via the Contact page. We will respond within the time the law allows.

If you are unhappy with how we have handled your information, please tell us first so we can try to put it right. You also have the right to complain to the Information Commissioner's Office (ICO), the UK data protection regulator, at ico.org.uk.

Changes to This Policy

We may update this policy from time to time to reflect changes in our practices or in the law. The version published on this page is the current version.`;

const SHIPPING_BODY = `Processing Times

Orders are typically processed and dispatched within one to two working days of payment being confirmed. Orders placed on weekends or UK public holidays are processed on the next working day. During exceptionally busy periods, processing may take slightly longer. If so, we will let you know.

Delivery Options and Timeframes

We currently offer two delivery options at checkout:

- UK Delivery (Royal Mail Tracked) for £10, typically 2 to 4 working days from dispatch.

- International Delivery (Royal Mail International Tracked) for £40, typically 7 to 14 working days from dispatch, depending on destination and customs processes.

These timeframes are estimates and are not guaranteed. Factors outside our control, including customs checks, courier delays and severe weather, can occasionally extend delivery times.

Shipping Costs

Shipping is charged at a flat rate of £10 for UK delivery and £40 for international delivery, shown in your basket and confirmed again at checkout before you complete your order.

Packaging

All orders are packed carefully to protect the contents in transit. If you have any specific delivery instructions, please get in touch before placing your order and we will do our best to help.

Tracking Your Order

Once your order has been dispatched, we will send a confirmation email containing your tracking information where available. You can also check the status of your order at any time from your account.

International Orders

For deliveries outside the United Kingdom, your order may be subject to import duties, taxes or customs charges set by the destination country. These charges are the responsibility of the recipient and are not included in our shipping costs or product prices. We recommend checking with your local customs office before placing an international order.

Issues With Delivery

If your order has not arrived within the expected timeframe, or arrives damaged, please contact our support team with your order number as soon as possible so that we can look into it and put things right.`;

const RETURNS_BODY = `Changing Your Mind

Under the Consumer Contracts Regulations 2013, you have 14 days from the day you receive your order to tell us you would like to cancel it. You do not need to give a reason. You then have a further 14 days to send the items back to us.

Opened or Unsealed Products

Skincare is a personal product. For health protection and hygiene reasons, the right to change your mind does not apply to sealed cosmetic products once they have been opened or unsealed after delivery. Items returned under this section should be unopened, unused and in their original packaging. This does not affect your rights if an item is faulty or not as described.

Faulty or Incorrect Items

Under the Consumer Rights Act 2015, your products must be as described, of satisfactory quality and fit for purpose. If an item arrives faulty, damaged, or different from what you ordered, please contact us with your order number, a short description of the problem, and photographs where possible. Where the problem is confirmed, we will arrange a replacement or refund and cover the reasonable cost of returning the item. You have 30 days from delivery to reject a faulty item for a full refund, and further rights after that.

If a Product Does Not Suit Your Skin

If you experience irritation, stop using the product and contact us with your order number. We will do our best to help. If a reaction is severe or does not settle, please seek advice from a pharmacist or doctor.

How to Start a Return or Report an Issue

Please contact our support team through the Contact page before sending anything back, with your order number and a brief explanation. We will confirm the return address and the next steps. If you are returning an item because you have changed your mind, the cost of return postage is yours to pay.

Your Statutory Rights

Nothing in this policy affects your statutory rights as a consumer under UK law. This policy should be read alongside our Terms and Conditions, Product Disclaimer and Refund Policy.`;

const REFUND_BODY = `Refunds

Refunds are made using the same payment method you used at checkout, unless we agree otherwise with you. If you cancel within your 14-day cancellation period, we will refund the price of the items and the standard delivery charge you paid, within 14 days of receiving the items back or of you showing us that you have sent them. Your bank or payment provider may then take a few days to show the money in your account.

If an item is faulty, damaged or not as described, we will also cover the reasonable cost of returning it.

Cancellations

If you wish to cancel an order, please contact us as soon as possible. If your order has not yet been dispatched, we will cancel it and refund you in full. Once an order has been dispatched, the process set out in our Returns Policy applies instead.

Your Statutory Rights

Nothing in this policy affects your statutory rights as a consumer under UK law, including the Consumer Rights Act 2015 and the Consumer Contracts Regulations 2013. This policy should be read alongside our Terms and Conditions, Returns Policy and Product Disclaimer.`;

export const POLICY_DEFAULTS: Record<string, PolicyDefault> = {
  'announcement-bar': { title: '', body: DEFAULT_ANNOUNCEMENT_TEXT },
  terms: { title: 'Terms and Conditions', body: TERMS_BODY },
  privacy: { title: 'Privacy Policy', body: PRIVACY_BODY },
  'shipping-policy': { title: 'Shipping Policy', body: SHIPPING_BODY },
  'returns-policy': { title: 'Returns Policy', body: RETURNS_BODY },
  'refund-policy': { title: 'Refund Policy', body: REFUND_BODY },
};
