'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';

/**
 * Hook to get the current access token.
 * Since AuthGate already ensures users are authenticated before rendering pages,
 * this hook doesn't need a loading state - we can trust auth is already confirmed.
 */
export function useAccessToken() {
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    // Get initial token
    supabase.auth.getSession().then(({ data }) => {
      setAccessToken(data?.session?.access_token ?? null);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAccessToken(session?.access_token ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return accessToken;
}
