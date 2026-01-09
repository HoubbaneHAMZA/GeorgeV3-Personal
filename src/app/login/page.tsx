'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (error) throw error;
      router.replace('/');
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Authentication failed.';
      setMessage(text);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="george-app">
      <main className="george-login">
        <div className="george-login-card">
          <div className="george-login-header">
            <h1 className="george-login-title">George 3.0</h1>
            <p className="george-login-subtitle">DxO Labs Support Assistant</p>
          </div>

          <form className="george-login-form" onSubmit={handleAuth}>
            <input
              type="email"
              className="george-login-input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              placeholder="Email"
            />
            <input
              type="password"
              className="george-login-input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
              placeholder="Password"
            />
            <button type="submit" className="george-login-submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          {message ? <div className="george-login-message">{message}</div> : null}
          <p className="george-login-footnote">Internal use only</p>
        </div>
      </main>
    </div>
  );
}
