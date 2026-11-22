'use client';

import { useState } from 'react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <form
        className="card w-full max-w-sm space-y-4 p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          const res = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
          setBusy(false);
          if (!res.ok) {
            setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Login failed');
            return;
          }
          const next = new URLSearchParams(window.location.search).get('next');
          window.location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
        }}
      >
        <h1 className="text-xl font-bold">BetTracker</h1>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">Password</span>
          <input className="field" type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Password" />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <button className="btn btn-primary w-full justify-center" disabled={busy}>
          Log in
        </button>
      </form>
    </div>
  );
}
