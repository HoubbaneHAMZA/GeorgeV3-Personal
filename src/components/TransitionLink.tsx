'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ComponentProps, MouseEvent } from 'react';
import { useNavigationGuard } from '@/contexts/NavigationGuardContext';

type TransitionLinkProps = ComponentProps<typeof Link>;

export default function TransitionLink({ href, onClick, children, ...props }: TransitionLinkProps) {
  const router = useRouter();
  const { requestNavigation } = useNavigationGuard();

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // Call original onClick if provided
    onClick?.(e);

    // If default was prevented, don't do anything
    if (e.defaultPrevented) return;

    // Check navigation guard - if blocked, show warning modal
    if (typeof href === 'string' && !requestNavigation(href)) {
      e.preventDefault();
      return;
    }

    // Check if View Transitions API is available
    const supportsViewTransitions = 'startViewTransition' in document;

    if (supportsViewTransitions && typeof href === 'string') {
      e.preventDefault();
      (document as Document & { startViewTransition: (cb: () => void) => void }).startViewTransition(() => {
        router.push(href);
      });
    }
    // Otherwise, let Next.js Link handle it normally
  };

  return (
    <Link href={href} onClick={handleClick} {...props}>
      {children}
    </Link>
  );
}
