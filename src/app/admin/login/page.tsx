'use client';

import { useState } from 'react';

export default function AdminLoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, rememberMe }),
      });

      if (res.ok) {
        // Full reload (not router.push) so the session cookie set by the API
        // response is guaranteed to be sent on the very next request and the
        // middleware re-evaluates auth with fresh state — avoids the stale
        // client-router-cache redirect that required a second click.
        window.location.href = '/admin/dashboard';
        return;
      }
      setError('Invalid username or password.');
      setLoading(false);
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="h-full bg-stone-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="font-serif text-2xl tracking-[0.08em] text-gold-700 font-bold">
            Windsor Beauty
          </div>
          <div className="text-[8px] tracking-[0.3em] text-stone-400 uppercase mt-1">
            Staff Portal
          </div>
        </div>

        <div className="bg-white border border-stone-200 p-8">
          <h1 className="text-xs tracking-[0.2em] uppercase text-stone-600 font-semibold mb-6">
            Admin Login
          </h1>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[9px] tracking-[0.2em] uppercase text-stone-400 mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                autoComplete="username"
                className="w-full border border-stone-200 focus:border-gold-400 outline-none px-3 py-2.5 text-sm text-stone-700 bg-white transition-colors"
              />
            </div>
            <div>
              <label className="block text-[9px] tracking-[0.2em] uppercase text-stone-400 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full border border-stone-200 focus:border-gold-400 outline-none px-3 py-2.5 text-sm text-stone-700 bg-white transition-colors"
              />
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                className="accent-gold-500"
              />
              <span className="text-[9px] tracking-[0.15em] uppercase text-stone-400">Stay signed in for 30 days</span>
            </label>

            {error && (
              <p className="text-xs text-red-500">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gold-700 text-white text-[10px] tracking-[0.22em] uppercase py-3 hover:bg-gold-800 transition-colors disabled:bg-stone-200 disabled:text-stone-400"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-[9px] text-stone-400 mt-4">
          This area is restricted to authorised staff only.
        </p>
      </div>
    </div>
  );
}
