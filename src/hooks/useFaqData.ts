'use client';

import useSWR from 'swr';

type FaqResponse<T> = {
  qaiItems: T[];
};

const fetcher = async <T>(url: string): Promise<T[]> => {
  const response = await fetch(url);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to fetch FAQs');
  }

  const data: FaqResponse<T> = await response.json();
  return data.qaiItems || [];
};

export function useFaqData<T>() {
  const { data, error, isLoading, isValidating, mutate } = useSWR<T[]>(
    '/api/faq',
    fetcher<T>,
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

  return {
    qaiItems: data ?? [],
    isLoading,
    isValidating,
    error: error ? (error instanceof Error ? error.message : 'Unknown error') : null,
    refresh: mutate
  };
}
