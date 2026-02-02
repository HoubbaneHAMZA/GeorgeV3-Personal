'use client';

import useSWR from 'swr';

type AnalyticsView = 'message' | 'conversation';
type AnalyticsScope = 'global' | 'personal';
type MetricType = 'usage' | 'feedback';

// Message view types
type MessageOverviewData = {
  total_runs: number;
  feedback_count: number;
  feedback_rate: number;
  unusable_rate: number;
  problematic_rate: number;
  usable_rate: number;
  good_rate: number;
  perfect_rate: number;
  avg_cost: number;
  avg_response_time: number;
};

export type MessageTrendData = {
  date: string;
  total: number;
  feedback_count: number;
  unusable: number;
  problematic: number;
  usable: number;
  good: number;
  perfect: number;
};

type TagData = {
  tag: string;
  count: number;
  unusable: number;
  problematic: number;
};

// Message category data (for message view with categories from conversations)
export type MessageCategoryData = {
  category: string;
  count: number;
  perfect: number;
  good: number;
  usable: number;
  problematic: number;
  unusable: number;
};

type FeedbackItem = {
  id: string;
  created_at: string;
  user_input: string;
  response_content: string;
  feedback_rating: 'unusable' | 'problematic' | 'usable' | 'good' | 'perfect';
  feedback_tags: string[] | null;
  feedback_comment: string | null;
  trace_data: unknown;
};

type MessageAnalyticsBundle = {
  overview: MessageOverviewData;
  trends: MessageTrendData[];
  tags: TagData[];
  categories: MessageCategoryData[];
  feedback_list: {
    interactions: FeedbackItem[];
    page: number;
    limit: number;
  };
};

// Conversation view types
type ConversationOverviewData = {
  total_conversations: number;
  feedback_count: number;
  feedback_rate: number;
  solved_rate: number;
  partially_solved_rate: number;
  not_solved_rate: number;
  avg_cost: number;
  avg_exchanges: number;
};

type ConversationTrendData = {
  date: string;
  total: number;
  solved: number;
  partially_solved: number;
  not_solved: number;
};

export type CategoryData = {
  category: string;
  count: number;
  solved: number;
  partially_solved: number;
  not_solved: number;
};

type ConversationItem = {
  id: string;
  title: string;
  category: string | null;
  sub_category: string | null;
  feedback_rating: 'solved' | 'partially_solved' | 'not_solved';
  feedback_comment: string | null;
  message_count: number;
  created_at: string;
};

type ConversationAnalyticsBundle = {
  overview: ConversationOverviewData;
  trends: ConversationTrendData[];
  categories: CategoryData[];
  feedback_list: {
    conversations: ConversationItem[];
    page: number;
    limit: number;
  };
};

// Cost trend data for usage charts
export type CostTrendData = {
  date: string;
  total_cost: number;
  total_runs?: number;
  total_conversations?: number;
};

// Extended bundle type that includes cost trends
type MessageAnalyticsBundleWithCost = MessageAnalyticsBundle & {
  costTrends?: CostTrendData[];
};

type ConversationAnalyticsBundleWithCost = ConversationAnalyticsBundle & {
  costTrends?: CostTrendData[];
};

export type AnalyticsBundle = MessageAnalyticsBundleWithCost | ConversationAnalyticsBundleWithCost;

export function isConversationBundle(bundle: AnalyticsBundle): bundle is ConversationAnalyticsBundleWithCost {
  // Both message and conversation bundles now have categories
  // Distinguish by checking for conversation-specific overview fields
  return 'overview' in bundle && 'solved_rate' in bundle.overview;
}

type UseAnalyticsBundleParams = {
  accessToken: string | null;
  from: string;
  to: string;
  view: AnalyticsView;
  scope: AnalyticsScope;
  metricType: MetricType;
  ratingFilter: string;
  page: number;
  limit: number;
};

const fetcher = async ([url, token]: [string, string]) => {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    throw new Error('Failed to fetch analytics data');
  }
  return response.json();
};

export function useAnalyticsBundle({
  accessToken,
  from,
  to,
  view,
  scope,
  metricType,
  ratingFilter,
  page,
  limit
}: UseAnalyticsBundleParams) {
  // Build the URL with params
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  params.set('interval', 'day');
  if (ratingFilter) params.set('rating', ratingFilter);
  params.set('page', String(page));
  params.set('limit', String(limit));
  params.set('scope', scope);
  params.set('view', view);
  params.set('metric', metricType);

  const url = `/api/feedback-analytics/bundle?${params}`;

  // Only fetch if we have an access token
  const shouldFetch = !!accessToken;

  const { data, error, isLoading, isValidating, mutate } = useSWR<AnalyticsBundle>(
    shouldFetch ? [url, accessToken] : null,
    fetcher,
    {
      // Show stale data immediately while revalidating
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      // Keep previous data while loading new data (prevents flash of loading state)
      keepPreviousData: true,
      // Dedupe requests within 2 seconds
      dedupingInterval: 2000,
      // Cache data for 5 minutes
      refreshInterval: 0, // Don't auto-refresh, user can manually refresh
      // Error retry
      errorRetryCount: 2,
      errorRetryInterval: 1000
    }
  );

  // Check if the current data matches the requested view
  // If data is for a different view, treat it as loading
  const isDataForCurrentView = data
    ? (view === 'conversation' ? isConversationBundle(data) : !isConversationBundle(data))
    : false;

  // Show loading if:
  // 1. SWR is loading (first load for this key)
  // 2. Data exists but is for a different view (view was switched)
  const showLoading = isLoading || (isValidating && !isDataForCurrentView);

  return {
    bundle: isDataForCurrentView ? data : null,
    isLoading: showLoading,
    isValidating, // Raw validating state (true during any fetch)
    error: error ? (error instanceof Error ? error.message : 'Unknown error') : null,
    refresh: mutate
  };
}
