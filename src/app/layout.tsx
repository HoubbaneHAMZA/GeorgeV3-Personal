import './globals.css';
import type { ReactNode } from 'react';
import AuthGate from '@/components/AuthGate';

export const metadata = {
  title: 'DxO Labs Agent',
  description: 'Next.js port of the DxO Labs support agent.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
