'use client';

import { useState, useEffect, useCallback } from 'react';
import useSWR from 'swr';
import { supabase } from '@/lib/supabase/client';
import { type Conversation } from '@/components/ConversationList';

type ConversationsResponse = {
  conversations: Conversation[];
};

type FetcherArgs = [string, string]; // [url, accessToken]

const fetcher = async ([url, token]: FetcherArgs): Promise<Conversation[]> => {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    if (response.status >= 500) {
      throw new Error('Server error');
    }
    throw new Error('Failed to fetch conversations');
  }

  const data: ConversationsResponse = await response.json();
  return data.conversations || [];
};

export function useConversationsList() {
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // Get access token on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: sessionData }) => {
      setAccessToken(sessionData?.session?.access_token ?? null);
    });
  }, []);

  const { data, error, isLoading, isValidating, mutate } = useSWR<Conversation[]>(
    accessToken ? ['/api/conversations', accessToken] : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 2000,
      refreshInterval: 0,
      errorRetryCount: 2,
      errorRetryInterval: 1000,
      keepPreviousData: true
    }
  );

  // Optimistic update for feedback
  const updateConversationFeedback = useCallback(
    (conversationId: string, rating: 'solved' | 'partially_solved' | 'not_solved', comment?: string | null) => {
      mutate(
        (current) =>
          current?.map((c) =>
            c.id === conversationId
              ? { ...c, feedback_rating: rating, feedback_comment: comment || null }
              : c
          ),
        { revalidate: false }
      );
    },
    [mutate]
  );

  // Optimistic update for delete
  const removeConversation = useCallback(
    (conversationId: string) => {
      mutate(
        (current) => current?.filter((c) => c.id !== conversationId),
        { revalidate: false }
      );
    },
    [mutate]
  );

  // Optimistic update for rename
  const renameConversation = useCallback(
    (conversationId: string, newTitle: string) => {
      mutate(
        (current) =>
          current?.map((c) => (c.id === conversationId ? { ...c, title: newTitle } : c)),
        { revalidate: false }
      );
    },
    [mutate]
  );

  return {
    conversations: data ?? [],
    accessToken,
    isLoading,
    isValidating,
    error: error ? (error instanceof Error ? error.message : 'Unknown error') : null,
    refresh: mutate,
    updateConversationFeedback,
    removeConversation,
    renameConversation
  };
}
