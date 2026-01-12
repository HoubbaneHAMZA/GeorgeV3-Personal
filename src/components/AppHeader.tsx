'use client';

import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export default function AppHeader() {
  const router = useRouter();
  const pathname = usePathname();

  const clearLocalSupabaseSession = () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return;
    const ref = new URL(supabaseUrl).hostname.split('.')[0];
    const baseKey = `sb-${ref}-auth-token`;
    localStorage.removeItem(baseKey);
    localStorage.removeItem(`${baseKey}-code-verifier`);
  };

  return (
    <header className="george-header">
      <div className="george-header-left">
        <img src="/george-logo.png" className="george-logo" />
        <div className="george-header-text">
          <h1 className="george-title">George 3.0</h1>
          <p className="george-subtitle">DxO Labs Support Assistant</p>
        </div>
      </div>
      <nav className="george-nav">
        <a href="/" className={`george-nav-link${pathname === '/' ? ' is-active' : ''}`}>Ask George</a>
        <a href="/docs" className={`george-nav-link${pathname === '/docs' ? ' is-active' : ''}`}>Documentation</a>
        <a href="/faq" className={`george-nav-link${pathname === '/faq' ? ' is-active' : ''}`}>FAQ</a>
        <a href="/updates" className={`george-nav-link${pathname === '/updates' ? ' is-active' : ''}`}>Updates</a>
        <button
          type="button"
          className="george-signout"
          onClick={async () => {
            const { error } = await supabase.auth.signOut({ scope: 'local' });
            if (error) {
              console.error('Sign out failed:', error.message);
            }
            clearLocalSupabaseSession();
            window.location.href = '/login';
          }}
          aria-label="Sign out"
        >
          <span className="george-signout-tooltip" role="tooltip">Logout</span>
          <svg className="george-signout-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M14 4h-6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M10 12h10M16 8l4 4-4 4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </nav>
    </header>
  );
}
