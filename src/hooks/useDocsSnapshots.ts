'use client';

import useSWR from 'swr';

type UpdatedFile = {
  docId: string;
  docUpdatedAt: string | null;
};

type SnapshotData = {
  lastUpdated: string | null;
  updatedFiles: UpdatedFile[];
};

export type DocsSnapshots = Record<string, SnapshotData>;

type ApiSnapshot = {
  vectorstore_key?: unknown;
  last_updated?: unknown;
  updated_files?: Array<{
    doc_id?: unknown;
    file_name?: unknown;
    doc_updated_at?: unknown;
  }>;
};

const fetcher = async (url: string): Promise<DocsSnapshots> => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || 'Failed to load snapshots.');
  }

  const payload = await response.json();
  const snapshots = Array.isArray(payload?.snapshots) ? payload.snapshots : [];

  const result: DocsSnapshots = {};
  snapshots.forEach((row: ApiSnapshot) => {
    const key = String(row?.vectorstore_key || '').toLowerCase();
    if (!key) return;

    const updatedFiles = Array.isArray(row?.updated_files)
      ? row.updated_files.map((item) => ({
          docId: String(item?.doc_id || item?.file_name || ''),
          docUpdatedAt: item?.doc_updated_at ? String(item.doc_updated_at) : null
        }))
      : [];

    result[key] = {
      lastUpdated: row?.last_updated ? String(row.last_updated) : null,
      updatedFiles
    };
  });

  return result;
};

export function useDocsSnapshots() {
  const { data, error, isLoading, isValidating, mutate } = useSWR<DocsSnapshots>(
    '/api/docs/snapshots',
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 2000,
      refreshInterval: 0,
      errorRetryCount: 2,
      errorRetryInterval: 1000
    }
  );

  return {
    snapshots: data ?? null,
    isLoading,
    isValidating,
    error: error ? (error instanceof Error ? error.message : 'Unknown error') : null,
    refresh: mutate
  };
}
