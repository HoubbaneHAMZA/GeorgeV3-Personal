'use client';

import { useCallback, useRef } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';

export type CachedConversationMessage = {
  id: string;
  user_input: string;
  response_content: string;
  response_sources?: string[];
  trace_data?: unknown;
  timing_server_ms?: number;
  feedback_rating?: string | null;
};

export type CachedConversation = {
  conversation: {
    id: string;
    session_id: string;
    title: string | null;
  };
  messages: CachedConversationMessage[];
};

type FetcherArgs = [string, string]; // [url, accessToken]

const fetcher = async ([url, token]: FetcherArgs): Promise<CachedConversation> => {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    throw new Error('Failed to fetch conversation');
  }
  return response.json();
};

// Cache key generator
const getConversationCacheKey = (conversationId: string) =>
  `/api/conversations/${conversationId}`;

// Global prefetch function - can be called from anywhere
// Returns the fetched data so it can be stored in external caches
export async function prefetchConversation(
  conversationId: string,
  accessToken: string
): Promise<CachedConversation | null> {
  const cacheKey = getConversationCacheKey(conversationId);

  try {
    // Fetch the data
    const data = await fetcher([cacheKey, accessToken]);

    // Store in SWR cache
    await globalMutate([cacheKey, accessToken], data, { revalidate: false });

    return data;
  } catch {
    return null;
  }
}

type UseConversationCacheParams = {
  conversationId: string | null;
  accessToken: string | null;
  enabled?: boolean;
};

export function useConversationCache({
  conversationId,
  accessToken,
  enabled = true
}: UseConversationCacheParams) {
  const shouldFetch = enabled && !!conversationId && !!accessToken;
  const cacheKey = conversationId ? getConversationCacheKey(conversationId) : null;

  const { data, error, isLoading, isValidating, mutate } = useSWR<CachedConversation>(
    shouldFetch ? [cacheKey, accessToken] : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      // Keep data in cache even when component unmounts
      keepPreviousData: false,
      // Don't auto-refresh
      refreshInterval: 0,
      // Cache indefinitely until manually invalidated
      dedupingInterval: 60000, // 1 minute deduping
      // Error handling
      errorRetryCount: 2,
      errorRetryInterval: 1000,
      // Important: This keeps the cache warm
      revalidateIfStale: false
    }
  );

  // Prefetch a conversation (for hover)
  const prefetch = useCallback(async (id: string) => {
    if (!accessToken) return;
    await prefetchConversation(id, accessToken);
  }, [accessToken]);

  // Invalidate cache for a specific conversation
  const invalidate = useCallback(async (id?: string) => {
    const targetId = id || conversationId;
    if (!targetId || !accessToken) return;
    const key = getConversationCacheKey(targetId);
    await globalMutate([key, accessToken]);
  }, [conversationId, accessToken]);

  return {
    data,
    error: error ? (error instanceof Error ? error.message : 'Unknown error') : null,
    isLoading,
    isValidating,
    prefetch,
    invalidate,
    refresh: mutate
  };
}

// Hook for prefetching on hover with debounce
export function useConversationPrefetch(
  accessToken: string | null,
  onPrefetchComplete?: (conversationId: string, data: CachedConversation) => void
) {
  const hoverTimeoutRef = useRef<number | null>(null);
  const prefetchedIds = useRef<Set<string>>(new Set());

  const handleMouseEnter = useCallback((conversationId: string) => {
    if (!accessToken) return;

    // Skip if already prefetched
    if (prefetchedIds.current.has(conversationId)) return;

    // Debounce - only prefetch if hovering for 150ms
    hoverTimeoutRef.current = window.setTimeout(async () => {
      try {
        const data = await prefetchConversation(conversationId, accessToken);
        if (data) {
          prefetchedIds.current.add(conversationId);
          // Notify caller so they can store in their own cache
          onPrefetchComplete?.(conversationId, data);
        }
      } catch {
        // Silently fail prefetch
      }
    }, 150);
  }, [accessToken, onPrefetchComplete]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  }, []);

  // Clear prefetched cache (e.g., when user logs out)
  const clearPrefetchCache = useCallback(() => {
    prefetchedIds.current.clear();
  }, []);

  return {
    handleMouseEnter,
    handleMouseLeave,
    clearPrefetchCache
  };
}
