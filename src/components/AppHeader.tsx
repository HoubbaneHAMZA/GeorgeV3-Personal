'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export default function AppHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isProfileClosing, setIsProfileClosing] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      setUserEmail(user?.email || null);
      // Get full_name from user_metadata, fallback to formatted email prefix
      const fullName = user?.user_metadata?.full_name;
      if (fullName) {
        setUserName(fullName);
      } else if (user?.email) {
        // Fallback: format email prefix as name
        const emailName = user.email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        setUserName(emailName);
      }
    };
    fetchUser();
  }, []);

  // Animate close then hide
  const closeProfileDropdown = () => {
    if (!isProfileOpen || isProfileClosing) return;
    setIsProfileClosing(true);
    setTimeout(() => {
      setIsProfileOpen(false);
      setIsProfileClosing(false);
    }, 150);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        closeProfileDropdown();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isProfileOpen, isProfileClosing]);

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
        <a href="/guide" className={`george-nav-link${pathname === '/guide' ? ' is-active' : ''}`}>How to Use</a>
        <a href="/docs" className={`george-nav-link${pathname === '/docs' ? ' is-active' : ''}`}>Documentation</a>
        <a href="/faq" className={`george-nav-link${pathname === '/faq' ? ' is-active' : ''}`}>FAQ</a>
        <a href="/updates" className={`george-nav-link${pathname === '/updates' ? ' is-active' : ''}`}>Updates</a>
        <a href="/analytics" className={`george-nav-link${pathname === '/analytics' ? ' is-active' : ''}`}>Analytics</a>
        <div className="george-profile" ref={profileRef}>
          <button
            type="button"
            className={`george-profile-button${isProfileOpen ? ' is-active' : ''}`}
            onClick={() => {
              if (isProfileOpen) {
                closeProfileDropdown();
              } else {
                setIsProfileOpen(true);
              }
            }}
            aria-label="Profile menu"
            aria-expanded={isProfileOpen}
          >
            <svg className="george-profile-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
              <path
                d="M4 20c0-4 4-6 8-6s8 2 8 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          {isProfileOpen && (
            <div className={`george-profile-dropdown${isProfileClosing ? ' is-closing' : ''}`}>
              <div className="george-profile-info">
                <div className="george-profile-name">{userName || 'Loading...'}</div>
                <div className="george-profile-email">{userEmail || ''}</div>
              </div>
              <button
                type="button"
                className="george-profile-logout"
                onClick={async () => {
                  const { error } = await supabase.auth.signOut({ scope: 'local' });
                  if (error) {
                    console.error('Sign out failed:', error.message);
                  }
                  clearLocalSupabaseSession();
                  window.location.href = '/login';
                }}
              >
                <svg className="george-profile-logout-icon" viewBox="0 0 24 24" aria-hidden="true">
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
                Logout
              </button>
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}
