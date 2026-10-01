'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_ABOUT_CONTENT, parseAboutContent, type AboutContent } from '@/lib/aboutContent';
import { DEFAULT_CONTACT_CONTENT, parseContactContent, slugifySubjectValue, type ContactContent, type ContactEmail } from '@/lib/contactContent';
import { DEFAULT_TRUST_BADGES, parseTrustBadges, type TrustBadge } from '@/lib/trustBadges';
import { DEFAULT_FOOTER_CONTENT, parseFooterContent, type FooterContent, type FooterEmail, type FooterLink } from '@/lib/footerContent';
import { htmlToMarkdownLite } from '@/lib/markdownLite';
import { DEFAULT_STORAGE_INSTRUCTIONS_HTML, DEFAULT_STORAGE_INSTRUCTIONS_MARKDOWN } from '@/data/products';
import AdminSidebar from '@/components/admin/AdminSidebar';

import AboutPageSection from './AboutPageSection';
import ContactPageSection from './ContactPageSection';
import ProductDefaultsSection from './ProductDefaultsSection';
import TrustBadgesSection from './TrustBadgesSection';
import FooterContentSection from './FooterContentSection';
import PolicyFieldsList from './PolicyFieldsList';
import { CONTENT_FIELDS, getFieldDefault, type ContentRow } from './contentFields';
import { useConfirm } from '@/components/admin/ConfirmProvider';

export default function AdminContentPage() {
  const confirm = useConfirm();
  const [values, setValues] = useState<Record<string, { title: string; body: string }>>({});
  const [overridden, setOverridden] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<Record<string, string>>({});

  const [about, setAbout] = useState<AboutContent>(DEFAULT_ABOUT_CONTENT);
  const [aboutOverridden, setAboutOverridden] = useState(false);
  const [aboutSaving, setAboutSaving] = useState(false);
  const [aboutMessage, setAboutMessage] = useState('');

  const [contact, setContact] = useState<ContactContent>(DEFAULT_CONTACT_CONTENT);
  const [contactOverridden, setContactOverridden] = useState(false);
  const [contactSaving, setContactSaving] = useState(false);
  const [contactMessage, setContactMessage] = useState('');

  // Global "Product Defaults" — site-wide fallback content for reusable
  // product info sections (currently just Storage Instructions). Products
  // without their own override use this content via the public
  // /api/products/storage-defaults endpoint.
  const [storageDefaults, setStorageDefaults] = useState({ enabled: true, content: DEFAULT_STORAGE_INSTRUCTIONS_MARKDOWN });
  const [storageDefaultsSaving, setStorageDefaultsSaving] = useState(false);
  const [storageDefaultsMessage, setStorageDefaultsMessage] = useState('');

  // Homepage trust badges
  const [trustBadges, setTrustBadges] = useState<TrustBadge[]>(DEFAULT_TRUST_BADGES);
  const [trustBadgesOverridden, setTrustBadgesOverridden] = useState(false);
  const [trustBadgesSaving, setTrustBadgesSaving] = useState(false);
  const [trustBadgesMessage, setTrustBadgesMessage] = useState('');

  // Footer / nav content (description, contact emails, nav + legal links,
  // footer note, copyright/bottom-right text)
  const [footerContent, setFooterContent] = useState<FooterContent>(DEFAULT_FOOTER_CONTENT);
  const [footerOverridden, setFooterOverridden] = useState(false);
  const [footerSaving, setFooterSaving] = useState(false);
  const [footerMessage, setFooterMessage] = useState('');

  useEffect(() => {
    fetch('/api/admin/content')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data.content)) {
          const rows = data.content as ContentRow[];
          const map: Record<string, { title: string; body: string }> = {};
          rows.forEach(row => {
            if (row.key === 'about' || row.key === 'contact') return;
            const field = CONTENT_FIELDS.find(f => f.key === row.key);
            // Content saved by the old Tiptap editor (format 'html') gets a
            // one-time, display-only conversion to lite-markdown the first
            // time it's opened here — the row itself isn't touched until
            // saved again. 'markdown' and legacy 'text' rows are already
            // plain text, valid lite-markdown as-is.
            const body = field?.hasTitle && row.format === 'html'
              ? htmlToMarkdownLite(row.body ?? '')
              : row.body ?? '';
            map[row.key] = { title: row.title ?? '', body };
          });
          setValues(map);
          setOverridden(new Set(rows.map(row => row.key)));

          const aboutRow = rows.find(row => row.key === 'about') ?? null;
          if (aboutRow) {
            // Same one-time, display-only HTML-to-lite-markdown conversion as
            // the policy fields above — the row itself isn't touched until
            // saved again, at which point it's always written as 'markdown'.
            const parsedAbout = parseAboutContent(aboutRow);
            const toDraft = (field: string) => (parsedAbout.format === 'html' ? htmlToMarkdownLite(field) : field);
            setAbout({
              ...parsedAbout,
              paragraphs: parsedAbout.paragraphs.map(toDraft),
              values: parsedAbout.values.map(v => ({ ...v, desc: toDraft(v.desc) })),
              groupBody: toDraft(parsedAbout.groupBody),
              format: 'markdown',
            });
            setAboutOverridden(true);
          }

          const contactRow = rows.find(row => row.key === 'contact') ?? null;
          if (contactRow) {
            setContact(parseContactContent(contactRow));
            setContactOverridden(true);
          }

          const trustBadgesRow = rows.find(row => row.key === 'homepage-trust-badges') ?? null;
          if (trustBadgesRow) {
            setTrustBadges(parseTrustBadges(trustBadgesRow));
            setTrustBadgesOverridden(true);
          }

          const footerRow = rows.find(row => row.key === 'footer-content') ?? null;
          if (footerRow) {
            setFooterContent(parseFooterContent(footerRow));
            setFooterOverridden(true);
          }

          const storageRow = rows.find(row => row.key === 'storage-instructions-default') ?? null;
          if (storageRow?.body) {
            try {
              const parsed = JSON.parse(storageRow.body);
              const isMarkdown = parsed?.format === 'markdown';
              const rawContent = typeof parsed?.content === 'string' && parsed.content ? parsed.content : DEFAULT_STORAGE_INSTRUCTIONS_HTML;
              setStorageDefaults({
                enabled: parsed?.enabled !== false,
                // Same one-time HTML-to-lite-markdown conversion as About/
                // Site Content — the editor always works in markdown from
                // here on; the row is only re-written that way on next save.
                content: isMarkdown ? rawContent : htmlToMarkdownLite(rawContent),
              });
            } catch {
              // Leave the built-in default in place if the saved row is malformed.
            }
          }
        } else {
          setLoadError('Failed to load site content.');
        }
      })
      .catch(() => setLoadError('Failed to load site content.'));
  }, []);

  function fieldValue(key: string) {
    if (values[key]) return values[key];
    const field = CONTENT_FIELDS.find(f => f.key === key);
    if (!field) return { title: '', body: '' };
    return getFieldDefault(field);
  }

  async function handleSave(key: string) {
    setSaving(key);
    setSavedMessage(prev => ({ ...prev, [key]: '' }));
    try {
      const { title, body } = fieldValue(key);
      const field = CONTENT_FIELDS.find(f => f.key === key);
      const format = field?.hasTitle ? 'markdown' : 'text';
      const res = await fetch('/api/admin/content', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, title, body, format }),
      });
      if (res.ok) {
        setSavedMessage(prev => ({ ...prev, [key]: 'Saved.' }));
        setOverridden(prev => new Set(prev).add(key));
      } else {
        const data = await res.json().catch(() => null);
        setSavedMessage(prev => ({ ...prev, [key]: data?.error || 'Failed to save.' }));
      }
    } catch {
      setSavedMessage(prev => ({ ...prev, [key]: 'Failed to save.' }));
    } finally {
      setSaving(null);
    }
  }

  async function handleReset(key: string) {
    if (!(await confirm({
      title: 'Reset this section to the default text?',
      body: 'Your saved changes for this section will be removed.',
      confirmLabel: 'Yes, reset it',
      cancelLabel: 'Keep my version',
      tone: 'danger',
    }))) return;
    setSaving(key);
    setSavedMessage(prev => ({ ...prev, [key]: '' }));
    try {
      const res = await fetch('/api/admin/content', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      if (res.ok) {
        setValues(prev => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        setOverridden(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        setSavedMessage(prev => ({ ...prev, [key]: 'Reset to default.' }));
      } else {
        const data = await res.json().catch(() => null);
        setSavedMessage(prev => ({ ...prev, [key]: data?.error || 'Failed to reset.' }));
      }
    } catch {
      setSavedMessage(prev => ({ ...prev, [key]: 'Failed to reset.' }));
    } finally {
      setSaving(null);
    }
  }

  function updateAboutValue(label: string, desc: string, index: number) {
    setAbout(prev => {
      const next = [...prev.values];
      next[index] = { label, desc };
      return { ...prev, values: next };
    });
  }


  async function handleSaveAbout() {
    setAboutSaving(true);
    setAboutMessage('');
    try {
      const { imageUrl, ...rest } = about;
      const res = await fetch('/api/admin/content', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'about', title: null, body: JSON.stringify({ ...rest, format: 'markdown' }), imageUrl }),
      });
      if (res.ok) {
        setAboutMessage('Saved.');
        setAboutOverridden(true);
      } else {
        const data = await res.json().catch(() => null);
        setAboutMessage(data?.error || 'Failed to save.');
      }
    } catch {
      setAboutMessage('Failed to save.');
    } finally {
      setAboutSaving(false);
    }
  }

  async function handleResetAbout() {
    if (!(await confirm({
      title: 'Reset the About page?',
      body: 'It goes back to its default text and the uploaded image is removed. This cannot be undone.',
      confirmLabel: 'Yes, reset it',
      cancelLabel: 'Keep my version',
      tone: 'danger',
    }))) return;
    setAboutSaving(true);
    setAboutMessage('');
    try {
      const res = await fetch('/api/admin/content', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'about' }),
      });
      if (res.ok) {
        setAbout(DEFAULT_ABOUT_CONTENT);
        setAboutOverridden(false);
        setAboutMessage('Reset to default.');
      } else {
        const data = await res.json().catch(() => null);
        setAboutMessage(data?.error || 'Failed to reset.');
      }
    } catch {
      setAboutMessage('Failed to reset.');
    } finally {
      setAboutSaving(false);
    }
  }

  function updateEmail(index: number, patch: Partial<ContactEmail>) {
    setContact(prev => ({
      ...prev,
      emails: prev.emails.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    }));
  }

  function addEmail() {
    setContact(prev => ({ ...prev, emails: [...prev.emails, { email: '', label: '' }] }));
  }

  function removeEmail(index: number) {
    setContact(prev => ({ ...prev, emails: prev.emails.filter((_, i) => i !== index) }));
  }

  function updateSubjectLabel(index: number, label: string) {
    setContact(prev => {
      const next = [...prev.subjects];
      next[index] = { ...next[index], label };
      return { ...prev, subjects: next };
    });
  }

  function addSubject() {
    setContact(prev => {
      const value = slugifySubjectValue('Custom Option', prev.subjects.map(s => s.value));
      return { ...prev, subjects: [...prev.subjects, { value, label: 'Custom Option' }] };
    });
  }

  function removeSubject(index: number) {
    setContact(prev => ({ ...prev, subjects: prev.subjects.filter((_, i) => i !== index) }));
  }

  async function handleSaveContact() {
    setContactSaving(true);
    setContactMessage('');
    try {
      const res = await fetch('/api/admin/content', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'contact', title: null, body: JSON.stringify(contact) }),
      });
      if (res.ok) {
        setContactMessage('Saved.');
        setContactOverridden(true);
      } else {
        const data = await res.json().catch(() => null);
        setContactMessage(data?.error || 'Failed to save.');
      }
    } catch {
      setContactMessage('Failed to save.');
    } finally {
      setContactSaving(false);
    }
  }

  async function handleResetContact() {
    if (!(await confirm({
      title: 'Reset the Contact page?',
      body: 'It goes back to its default text and options. This cannot be undone.',
      confirmLabel: 'Yes, reset it',
      cancelLabel: 'Keep my version',
      tone: 'danger',
    }))) return;
    setContactSaving(true);
    setContactMessage('');
    try {
      const res = await fetch('/api/admin/content', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'contact' }),
      });
      if (res.ok) {
        setContact(DEFAULT_CONTACT_CONTENT);
        setContactOverridden(false);
        setContactMessage('Reset to default.');
      } else {
        const data = await res.json().catch(() => null);
        setContactMessage(data?.error || 'Failed to reset.');
      }
    } catch {
      setContactMessage('Failed to reset.');
    } finally {
      setContactSaving(false);
    }
  }

  async function handleSaveStorageDefaults() {
    setStorageDefaultsSaving(true);
    setStorageDefaultsMessage('');
    try {
      const res = await fetch('/api/admin/content', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'storage-instructions-default', title: null, body: JSON.stringify({ ...storageDefaults, format: 'markdown' }) }),
      });
      if (res.ok) {
        setStorageDefaultsMessage('Saved.');
      } else {
        const data = await res.json().catch(() => null);
        setStorageDefaultsMessage(data?.error || 'Failed to save.');
      }
    } catch {
      setStorageDefaultsMessage('Failed to save.');
    } finally {
      setStorageDefaultsSaving(false);
    }
  }

  function updateTrustBadge(index: number, patch: Partial<TrustBadge>) {
    setTrustBadges(prev => prev.map((badge, i) => (i === index ? { ...badge, ...patch } : badge)));
  }

  async function handleSaveTrustBadges() {
    setTrustBadgesSaving(true);
    setTrustBadgesMessage('');
    try {
      const res = await fetch('/api/admin/content', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'homepage-trust-badges', title: null, body: JSON.stringify(trustBadges) }),
      });
      if (res.ok) {
        setTrustBadgesMessage('Saved.');
        setTrustBadgesOverridden(true);
      } else {
        const data = await res.json().catch(() => null);
        setTrustBadgesMessage(data?.error || 'Failed to save.');
      }
    } catch {
      setTrustBadgesMessage('Failed to save.');
    } finally {
      setTrustBadgesSaving(false);
    }
  }

  async function handleResetTrustBadges() {
    if (!(await confirm({
      title: 'Reset the trust badges?',
      body: 'They go back to their default text. This cannot be undone.',
      confirmLabel: 'Yes, reset it',
      cancelLabel: 'Keep my version',
      tone: 'danger',
    }))) return;
    setTrustBadgesSaving(true);
    setTrustBadgesMessage('');
    try {
      const res = await fetch('/api/admin/content', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'homepage-trust-badges' }),
      });
      if (res.ok) {
        setTrustBadges(DEFAULT_TRUST_BADGES);
        setTrustBadgesOverridden(false);
        setTrustBadgesMessage('Reset to default.');
      } else {
        const data = await res.json().catch(() => null);
        setTrustBadgesMessage(data?.error || 'Failed to reset.');
      }
    } catch {
      setTrustBadgesMessage('Failed to reset.');
    } finally {
      setTrustBadgesSaving(false);
    }
  }

  function updateFooterField(patch: Partial<Pick<FooterContent, 'description' | 'disclaimer' | 'copyrightSuffix' | 'bottomRightText'>>) {
    setFooterContent(prev => ({ ...prev, ...patch }));
  }

  function updateFooterEmail(index: number, patch: Partial<FooterEmail>) {
    setFooterContent(prev => ({ ...prev, emails: prev.emails.map((e, i) => (i === index ? { ...e, ...patch } : e)) }));
  }

  function updateFooterNavLink(index: number, patch: Partial<FooterLink>) {
    setFooterContent(prev => ({ ...prev, navLinks: prev.navLinks.map((l, i) => (i === index ? { ...l, ...patch } : l)) }));
  }

  function updateFooterLegalLink(index: number, patch: Partial<FooterLink>) {
    setFooterContent(prev => ({ ...prev, legalLinks: prev.legalLinks.map((l, i) => (i === index ? { ...l, ...patch } : l)) }));
  }

  async function handleSaveFooter() {
    setFooterSaving(true);
    setFooterMessage('');
    try {
      const res = await fetch('/api/admin/content', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'footer-content', title: null, body: JSON.stringify(footerContent) }),
      });
      if (res.ok) {
        setFooterMessage('Saved.');
        setFooterOverridden(true);
      } else {
        const data = await res.json().catch(() => null);
        setFooterMessage(data?.error || 'Failed to save.');
      }
    } catch {
      setFooterMessage('Failed to save.');
    } finally {
      setFooterSaving(false);
    }
  }

  async function handleResetFooter() {
    if (!(await confirm({
      title: 'Reset the footer?',
      body: 'It goes back to its default text and links. This cannot be undone.',
      confirmLabel: 'Yes, reset it',
      cancelLabel: 'Keep my version',
      tone: 'danger',
    }))) return;
    setFooterSaving(true);
    setFooterMessage('');
    try {
      const res = await fetch('/api/admin/content', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'footer-content' }),
      });
      if (res.ok) {
        setFooterContent(DEFAULT_FOOTER_CONTENT);
        setFooterOverridden(false);
        setFooterMessage('Reset to default.');
      } else {
        const data = await res.json().catch(() => null);
        setFooterMessage(data?.error || 'Failed to reset.');
      }
    } catch {
      setFooterMessage('Failed to reset.');
    } finally {
      setFooterSaving(false);
    }
  }

  return (
    <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
      {/* Sidebar */}
      <AdminSidebar />

      {/* Main */}
      <main className="flex-1 p-8 overflow-clip">
        <div className="max-w-3xl">
          <h1 className="text-lg font-semibold text-stone-800 mb-1">Site Content</h1>
          <p className="text-xs text-stone-500 mb-8">
            Edit the announcement bar and legal page content shown on the live site.
          </p>

          {loadError && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-3 mb-6">
              {loadError}
            </div>
          )}

          {/* Jump menu */}
          <nav className="bg-white border border-stone-200 px-4 py-3 mb-6 flex flex-wrap gap-x-4 gap-y-2">
            {[
              { label: 'About', href: '#section-about' },
              { label: 'Contact', href: '#section-contact' },
              { label: 'Product Defaults', href: '#section-product-defaults' },
              { label: 'Trust Badges', href: '#section-trust-badges' },
              { label: 'Footer & Navigation', href: '#section-footer-content' },
              { label: 'Announcement Bar', href: '#section-announcement-bar' },
              { label: 'Terms', href: '#section-terms' },
              { label: 'Privacy', href: '#section-privacy' },
              { label: 'Shipping Policy', href: '#section-shipping-policy' },
              { label: 'Returns Policy', href: '#section-returns-policy' },
              { label: 'Refund Policy', href: '#section-refund-policy' },
              { label: 'Cookie Policy', href: '#section-cookies' },
              { label: 'Disclaimer', href: '#section-disclaimer' },
              { label: 'Payment Policy', href: '#section-payment-policy' },
              { label: 'Contact Policy', href: '#section-contact-policy' },
            ].map(({ label, href }) => (
              <a
                key={href}
                href={href}
                className="text-[9px] tracking-[0.15em] uppercase text-stone-500 hover:text-gold-700 transition-colors whitespace-nowrap"
              >
                {label}
              </a>
            ))}
          </nav>

          <div className="space-y-6">
            <AboutPageSection
              about={about}
              setAbout={setAbout}
              updateAboutValue={updateAboutValue}
              handleSaveAbout={handleSaveAbout}
              handleResetAbout={handleResetAbout}
              aboutSaving={aboutSaving}
              aboutMessage={aboutMessage}
              aboutOverridden={aboutOverridden}
            />

            <ContactPageSection
              contact={contact}
              setContact={setContact}
              updateEmail={updateEmail}
              addEmail={addEmail}
              removeEmail={removeEmail}
              updateSubjectLabel={updateSubjectLabel}
              addSubject={addSubject}
              removeSubject={removeSubject}
              handleSaveContact={handleSaveContact}
              handleResetContact={handleResetContact}
              contactSaving={contactSaving}
              contactMessage={contactMessage}
              contactOverridden={contactOverridden}
            />

            <ProductDefaultsSection
              storageDefaults={storageDefaults}
              setStorageDefaults={setStorageDefaults}
              handleSaveStorageDefaults={handleSaveStorageDefaults}
              storageDefaultsSaving={storageDefaultsSaving}
              storageDefaultsMessage={storageDefaultsMessage}
            />

            <TrustBadgesSection
              trustBadges={trustBadges}
              updateTrustBadge={updateTrustBadge}
              handleSaveTrustBadges={handleSaveTrustBadges}
              handleResetTrustBadges={handleResetTrustBadges}
              trustBadgesSaving={trustBadgesSaving}
              trustBadgesMessage={trustBadgesMessage}
              trustBadgesOverridden={trustBadgesOverridden}
            />

            <FooterContentSection
              footerContent={footerContent}
              updateFooterField={updateFooterField}
              updateFooterEmail={updateFooterEmail}
              updateFooterNavLink={updateFooterNavLink}
              updateFooterLegalLink={updateFooterLegalLink}
              handleSaveFooter={handleSaveFooter}
              handleResetFooter={handleResetFooter}
              footerSaving={footerSaving}
              footerMessage={footerMessage}
              footerOverridden={footerOverridden}
            />

            <PolicyFieldsList
              fieldValue={fieldValue}
              setValues={setValues}
              overridden={overridden}
              handleSave={handleSave}
              handleReset={handleReset}
              saving={saving}
              savedMessage={savedMessage}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
