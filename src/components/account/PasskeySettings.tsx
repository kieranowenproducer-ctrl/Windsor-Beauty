'use client';

import { useEffect, useState } from 'react';
import PasskeyButton from './PasskeyButton';
import './passkey-settings.css';
import { postAccountJson } from '@/lib/accountRequest';

type Credential = { credential_id: string; label: string; created_at: string; last_used_at: string | null };
export default function PasskeySettings({ emailVerified, scope = 'admin' }: { emailVerified: boolean; scope?: 'admin' }) {
  const endpoint=scope==='admin'?'/api/admin/passkeys':'/api/account/passkeys';
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [createVersion, setCreateVersion] = useState(0);
  async function refresh() {
    setLoading(true);
    setLoadError('');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(endpoint+'/credentials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Your saved passkeys could not be loaded.');
      setCredentials([...data.credentials].sort((a: Credential, b: Credential) => Date.parse(b.created_at) - Date.parse(a.created_at)));
    } catch (error) {
      setLoadError(controller.signal.aborted ? 'Checking saved passkeys took too long. Please try again.' : error instanceof Error ? error.message : 'Your saved passkeys could not be loaded. Please try again.');
    } finally { clearTimeout(timeout); setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);
  function clearAndRefresh() {
    if (loading || removing || creating) return;
    setMessage('');setRemoveId(null);setPassword('');
    setCreateVersion(version => version + 1);
    void refresh();
  }
  async function remove(event: React.FormEvent) {
    event.preventDefault();
    if (!removeId || removing) return;
    setMessage('');
    setRemoving(true);
    try {
      const data = await postAccountJson<{redirect?:string}>(endpoint+'/revoke', { credentialId: removeId, password }, 'Passkey removal');
      window.location.assign(data.redirect || '/account/login');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to remove this passkey. Please try again.');
      setRemoving(false);
    }
  }
  return <section id="fast-sign-in" className="member-passkeys" aria-labelledby="passkey-heading">
    <div className="passkey-intro">
      <div className="passkey-copy">
        <p className="passkey-eyebrow">{scope==='admin'?'Administrator security':'Your account security'}</p>
        <h2 id="passkey-heading">{scope==='admin'?'Face ID and passkeys':'Fast sign-in'}</h2>
        <p>{scope==='admin'?'Use Face ID, your fingerprint or device PIN to sign in.':'Save a passkey once, then use Face ID, your fingerprint or your device PIN to sign in. No new password needed.'}</p>
      </div>
      <div className="passkey-action">
        {loading ? <p role="status">Checking saved passkeys...</p> : loadError ? <button type="button" className="passkey-secondary" onClick={() => void refresh()}>Try again</button> : emailVerified ?
          <PasskeyButton key={createVersion} mode="register" scope={scope} className="passkey-primary" registerLabel={scope==='admin'?(credentials.length?'Add another admin passkey':'Create an admin passkey'):(credentials.length?'Add another passkey':'Create a passkey')} onBusyChange={setCreating} onSuccess={() => { setMessage('Passkey saved.'); void refresh(); }} /> :
          <a className="passkey-secondary" href="#email-verification">Confirm your email first</a>}
        <button type="button" className="passkey-secondary" disabled={loading||removing||creating} onClick={clearAndRefresh}>Refresh</button>
      </div>
    </div>
    {!emailVerified && <p className="passkey-note">Email confirmation protects changes to your sign-in security. You can keep using your account.</p>}
    {loadError && <p className="passkey-feedback" role="alert">{loadError}</p>}
    {!loading && credentials.length > 0 && <div className="passkey-saved">
      <h3>{credentials.length===1?'Your saved passkey':`Your saved passkeys (${credentials.length})`}</h3>
      <ul>{credentials.map(credential => <li key={credential.credential_id}>
        <div className="passkey-saved-name"><strong>{credential.label}</strong><span>Added {new Date(credential.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
        <button type="button" className="passkey-text-button" aria-label={`Remove ${credential.label}`} disabled={!emailVerified || removing} onClick={() => { setRemoveId(credential.credential_id); setPassword(''); setMessage(''); }}>Remove</button>
      </li>)}</ul>
      {removeId && <form className="passkey-remove" onSubmit={remove}>
        <h3>Remove {credentials.find(credential => credential.credential_id === removeId)?.label || 'this passkey'}?</h3>
        <p>{scope==='admin'?'Removing it prevents new sign-ins with this passkey and signs you out here. Other existing staff sessions remain signed in.':'Removing it signs you out on every device. You can sign back in with your password.'}</p>
        <label htmlFor="passkey-remove-password">{scope==='admin'?'Your administrator password':'Your Windsor Beauty password'}<input id="passkey-remove-password" type="password" autoComplete="current-password" required maxLength={1024} value={password} disabled={removing} onChange={event => setPassword(event.target.value)} /></label>
        <div className="passkey-remove-actions"><button type="submit" className="passkey-primary" disabled={removing}>{removing ? 'Removing...' : 'Confirm removal'}</button><button type="button" className="passkey-secondary" disabled={removing} onClick={() => { setRemoveId(null); setPassword(''); }}>Cancel</button></div>
      </form>}
    </div>}
    {message && <p className="passkey-feedback" role="status" aria-live="polite">{message}</p>}
  </section>;
}
