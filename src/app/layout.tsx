import './globals.css';
import type { ReactNode } from 'react';
import AuthGate from '@/components/AuthGate';
import dynamic from 'next/dynamic';

// Only load Agentation in development - will be tree-shaken in production
const Agentation = dynamic(
  () => import('agentation').then((mod) => mod.Agentation),
  { ssr: false }
);

export const metadata = {
  title: 'DxO Labs Agent',
  description: 'Next.js port of the DxO Labs support agent.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthGate>{children}</AuthGate>
        {process.env.NODE_ENV === 'development' && <Agentation />}
      </body>
    </html>
  );
}
