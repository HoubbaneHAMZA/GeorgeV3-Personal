'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

const ALLOWED_DOMAINS = ['dxo.com'];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'error' | 'success'>('error');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [signUpSuccess, setSignUpSuccess] = useState(false);

  const isAllowedDomain = (emailAddress: string): boolean => {
    const domain = emailAddress.split('@')[1]?.toLowerCase();
    return domain ? ALLOWED_DOMAINS.includes(domain) : false;
  };

  const handleAuth = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    setLoading(true);

    try {
      if (isSignUp) {
        if (!isAllowedDomain(email)) {
          throw new Error('Sign-up is restricted to @dxo.com email addresses.');
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName.trim()
            }
          }
        });
        if (error) throw error;
        setMessageType('success');
        setMessage('Check your email for a confirmation link!');
        setSignUpSuccess(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (error) throw error;
        router.replace('/');
      }
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Authentication failed.';
      setMessageType('error');
      setMessage(text);
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    setMessage('');
    setSignUpSuccess(false);
    setFullName('');
  };

  return (
    <div className="george-app">
      <main className="george-login">
        <div className="george-login-card">
          <div className="george-login-header">
            <h1 className="george-login-title">George 3.0</h1>
            <p className="george-login-subtitle">DxO Labs Support Assistant</p>
          </div>

          {signUpSuccess ? (
            <>
              <div className="george-login-message is-success">
                {message}
              </div>
              <button type="button" className="george-login-toggle" onClick={toggleMode}>
                Back to sign in
              </button>
            </>
          ) : (
            <>
              <form className="george-login-form" onSubmit={handleAuth}>
                {isSignUp && (
                  <input
                    type="text"
                    className="george-login-input"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    required
                    autoComplete="name"
                    placeholder="Full Name"
                  />
                )}
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
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  placeholder="Password"
                />
                <button type="submit" className="george-login-submit" disabled={loading}>
                  {loading
                    ? (isSignUp ? 'Creating account...' : 'Signing in...')
                    : (isSignUp ? 'Sign up' : 'Sign in')}
                </button>
              </form>

              {message ? (
                <div className={`george-login-message ${messageType === 'success' ? 'is-success' : ''}`}>
                  {message}
                </div>
              ) : null}

              <button type="button" className="george-login-toggle" onClick={toggleMode}>
                {isSignUp ? 'Already have an account? Sign in' : 'Create an account'}
              </button>
            </>
          )}

          <p className="george-login-footnote">Internal use only</p>
        </div>
      </main>
    </div>
  );
}
