'use client';

import { useEffect, useId, useState } from 'react';
import { startAuthentication, startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { postAccountJson } from '@/lib/accountRequest';

async function post<T>(action: string, body: object, scope: 'admin') {
  return postAccountJson<T>(`/api/${scope==='admin'?'admin':'account'}/passkeys/${action}`, body);
}

export default function PasskeyButton({ mode = 'signin', onSuccess, className = '', rememberMe = true, onBusyChange, descriptive = false, registerLabel = 'Create a passkey', scope = 'admin' }: {
  mode?: 'signin' | 'register'; onSuccess?: (redirect?: string) => void; scope?: 'admin'; className?: string; rememberMe?: boolean; onBusyChange?: (busy: boolean) => void; descriptive?: boolean; registerLabel?: string;
}) {
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [password, setPassword] = useState('');
  const [passkeyName, setPasskeyName] = useState('');
  const [needsPassword, setNeedsPassword] = useState(mode === 'register' && scope === 'admin');
  const [interactive, setInteractive] = useState(false);
  const [instagram, setInstagram] = useState(false);
  useEffect(() => {
    const appleDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setInstagram(appleDevice && /\bInstagram\b/i.test(navigator.userAgent));
    setInteractive(true);
  }, []);
  async function begin() {
    if (busy || !interactive || instagram) return;
    setMessage('');
    if (mode === 'register' && scope === 'admin' && !passkeyName.trim()) { setMessage('Name this passkey so you can recognise whose device it belongs to.'); return; }
    if (mode === 'register' && needsPassword && !password) { setMessage(scope==='admin'?'Enter your administrator password first.':'Enter your Windsor Beauty password first.'); return; }
    if (!window.isSecureContext || !browserSupportsWebAuthn()) {
      setMessage('This browser cannot use passkeys here. Use your administrator username and password.');
      return;
    }
    setBusy(true);
    onBusyChange?.(true);
    try {
      if (mode === 'signin') {
        const optionsJSON = await post<Parameters<typeof startAuthentication>[0]['optionsJSON']>('authenticate-options', {}, scope);
        const response = await startAuthentication({ optionsJSON });
        const result = await post<{redirect?: string}>('authenticate-verify', { response, rememberMe }, scope);
        if (onSuccess) onSuccess(result.redirect); else window.location.assign(result.redirect || '/admin/dashboard');
      } else {
        const optionsJSON = await post<Parameters<typeof startRegistration>[0]['optionsJSON']>('register-options', { password }, scope);
        const response = await startRegistration({ optionsJSON });
        await post('register-verify', { response, label: scope==='admin'?passkeyName.trim():'My passkey' }, scope);
        setPassword('');
        setPasskeyName('');
        setNeedsPassword(scope==='admin');
        setMessage('Your passkey is ready. Keep your password as a backup.');
        onSuccess?.();
      }
    } catch (error) {
      if (mode === 'register' && error instanceof Error && 'code' in error && error.code === 'REAUTH_REQUIRED') {
        setNeedsPassword(true);
        setMessage(scope==='admin'?'Confirm your existing administrator password, then continue.':'Confirm your existing Windsor Beauty password, then continue. You do not need a new password.');
      } else if (error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'AbortError')) {
        setMessage(mode === 'register' ? 'Setup was cancelled. No passkey was added. You can try again.' : 'Passkey sign-in was cancelled. You can try again or use your password.');
      } else setMessage(error instanceof Error ? error.message : 'Please try again or use your password.');
    } finally { setBusy(false); onBusyChange?.(false); }
  }
  if (instagram) return mode === 'signin' ? <span className="passkey-browser-help" hidden /> : <p className="passkey-browser-help member-note" role="status">To create a passkey, open this page in Safari or Chrome from Instagram’s menu.</p>;
  const button = <button type={mode === 'register' ? 'submit' : 'button'} disabled={busy || !interactive} onClick={mode === 'signin' ? begin : undefined} className={className || 'w-full rounded-xl border border-stone-300 py-3 px-5 text-stone-800 disabled:opacity-50'}>
    {busy ? 'Follow your device prompt...' : mode === 'signin' ? descriptive ? <><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="8" cy="9" r="5"/><path d="m12 12 8 8m-3-3 3-3m-6 0 3-3"/></svg><span>Use a saved passkey<small>Face ID, fingerprint or device PIN</small></span></> : 'Use a saved passkey' : needsPassword ? 'Confirm and continue' : registerLabel}
  </button>;
  const feedback = message && <p role="status" aria-live="polite" className="passkey-feedback text-sm mt-3">{message}</p>;
  if (mode === 'signin') return <div>{button}{feedback}</div>;
  return <form className="passkey-create" onSubmit={event => { event.preventDefault(); void begin(); }}>
    {scope === 'admin' && <label htmlFor={`${inputId}-name`}>Passkey name<input id={`${inputId}-name`} type="text" autoComplete="off" placeholder="For example, Kieran's iPhone" required maxLength={80} disabled={busy} value={passkeyName} onChange={event => setPasskeyName(event.target.value)} /></label>}
    {needsPassword && <label htmlFor={`${inputId}-password`}>{scope==='admin'?'Your current administrator password':'Your current Windsor Beauty password'}<input id={`${inputId}-password`} type="password" autoComplete="current-password" required maxLength={1024} disabled={busy} value={password} onChange={event => setPassword(event.target.value)} /></label>}
    {button}{feedback}
  </form>;
}
