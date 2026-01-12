'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import AppHeader from '@/components/AppHeader';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data, error }) => {
      if (!mounted) return;
      const hasUser = Boolean(data.user) && !error;
      if (!hasUser && pathname !== '/login') {
        router.replace('/login');
        return;
      }
      if (hasUser && pathname === '/login') {
        router.replace('/');
        return;
      }
      setReady(true);
    });
    return () => {
      mounted = false;
    };
  }, [pathname, router]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && pathname !== '/login') {
        router.replace('/login');
        return;
      }
      if (session && pathname === '/login') {
        router.replace('/');
      }
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, [pathname, router]);

  if (!ready && pathname !== '/login') {
    return null;
  }

  return (
    <>
      {pathname !== '/login' ? <AppHeader /> : null}
      <div key={pathname} className="george-page">
        {children}
      </div>
    </>
  );
}
