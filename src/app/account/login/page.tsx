'use client';

import { useState } from 'react';
import Link from 'next/link';

/**
 * Where to go after signing in, when the page was reached from somewhere that
 * asked for a sign-in first (`?next=/reviews`, from the leave-a-review box).
 * Without this, everyone lands on /account and the thing they came to do is
 * two clicks away, which is where most people stop.
 *
 * Same-site paths only. It must start with a single slash: `//evil.com` and
 * `https://evil.com` are both valid destinations for a browser, so an
 * unchecked value here would turn the login page into an open redirect that
 * hands Windsor Glow's name to somebody else's page.
 */
function safeNextPath(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('next');
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw;
}

export default function AccountLoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/account/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json().catch(() => null);

      if (res.ok && data?.redirect) {
        // Full reload (not router.push) so the session cookie set by the API
        // response is guaranteed to be sent on the very next request and the
        // middleware re-evaluates auth with fresh state — avoids the stale
        // client-router-cache redirect that required a second click.
        //
        // `next` is honoured only for a customer sign-in (the API answers
        // '/account'). An admin sign-in always goes where the API says, so a
        // crafted link can never steer a staff login somewhere else.
        const next = data.redirect === '/account' ? safeNextPath() : null;
        window.location.href = next ?? data.redirect;
        return;
      }
      // A lock-page lead with no password yet — send them to set one up
      // instead of showing "incorrect password" for an account that's real
      // but was never given a password.
      if (data?.error === 'needsPassword' && data?.redirect) {
        window.location.href = data.redirect;
        return;
      }
      setError(data?.error || 'Incorrect email or password.');
      setLoading(false);
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  const inputClass = 'w-full border border-stone-200 focus:border-gold-400 outline-none px-3 py-2.5 text-sm text-stone-700 bg-white transition-colors';

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-2">Windsor Glow</p>
          <h1 className="font-serif text-3xl text-stone-800 tracking-wide">Sign In</h1>
          <p className="text-xs text-stone-500 mt-2 leading-relaxed">
            Access your account to track orders, view your order history, and manage your details.
          </p>
        </div>

        <div className="bg-white border border-gold-100 p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-[9px] tracking-[0.2em] uppercase text-stone-500 mb-1.5">
                Email Address
              </label>
              <input
                id="login-email"
                type="text"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                required
                autoComplete="username"
                className={inputClass}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="login-password" className="block text-[9px] tracking-[0.2em] uppercase text-stone-500">
                  Password
                </label>
                <Link href="/account/forgot-password" className="text-[9px] tracking-[0.1em] uppercase text-gold-700 hover:text-gold-800 font-medium">
                  Forgot password?
                </Link>
              </div>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className={inputClass}
              />
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gold-700 text-white text-[10px] tracking-[0.22em] uppercase py-3.5 hover:bg-gold-800 transition-colors disabled:bg-stone-200 disabled:text-stone-400 mt-2"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-stone-500 mt-6">
          New to Windsor Glow?{' '}
          <Link href="/account/register" className="text-gold-700 hover:text-gold-800 font-medium">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
