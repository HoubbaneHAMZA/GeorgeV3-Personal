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
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const hasSession = Boolean(data.session);
      if (!hasSession && pathname !== '/login') {
        router.replace('/login');
        return;
      }
      if (hasSession && pathname === '/login') {
        router.replace('/');
        return;
      }
      setReady(true);
    });
    return () => {
      mounted = false;
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
