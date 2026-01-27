'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import AnalyticsOverview from '@/components/analytics/AnalyticsOverview';
import AnalyticsTrends from '@/components/analytics/AnalyticsTrends';
import AnalyticsTags from '@/components/analytics/AnalyticsTags';
import AnalyticsCategories from '@/components/analytics/AnalyticsCategories';
import AnalyticsFeedbackList from '@/components/analytics/AnalyticsFeedbackList';
import { Download, Calendar, ChevronDown, User, Globe, MessageSquare, MessagesSquare } from 'lucide-react';

type AnalyticsView = 'message' | 'conversation';
type AnalyticsScope = 'global' | 'personal';

type DateRange = {
  from: string;
  to: string;
  label: string;
};

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

type MessageTrendData = {
  date: string;
  total: number;
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

type CategoryData = {
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

type AnalyticsBundle = MessageAnalyticsBundle | ConversationAnalyticsBundle;

function isConversationBundle(bundle: AnalyticsBundle): bundle is ConversationAnalyticsBundle {
  return 'categories' in bundle;
}

const DATE_PRESETS: { label: string; getDates: () => { from: string; to: string } }[] = [
  {
    label: 'Last 7 days',
    getDates: () => {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 7);
      return { from: from.toISOString(), to: to.toISOString() };
    }
  },
  {
    label: 'Last 30 days',
    getDates: () => {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 30);
      return { from: from.toISOString(), to: to.toISOString() };
    }
  },
  {
    label: 'Last 90 days',
    getDates: () => {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 90);
      return { from: from.toISOString(), to: to.toISOString() };
    }
  },
  {
    label: 'All time',
    getDates: () => ({ from: '', to: '' })
  }
];

export default function AnalyticsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const preset = DATE_PRESETS[1]; // Default to last 30 days
    const dates = preset.getDates();
    return { ...dates, label: preset.label };
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [bundle, setBundle] = useState<AnalyticsBundle | null>(null);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [ratingFilter, setRatingFilter] = useState<string>('');
  const [page, setPage] = useState(1);

  // Read initial values from URL params
  const urlView = searchParams.get('view');
  const urlScope = searchParams.get('scope');
  const [scope, setScope] = useState<AnalyticsScope>(() =>
    urlScope === 'personal' || urlScope === 'global' ? urlScope : 'global'
  );
  const [view, setView] = useState<AnalyticsView>(() =>
    urlView === 'message' || urlView === 'conversation' ? urlView : 'message'
  );
  const limit = 10;

  // Update URL when view or scope changes
  const updateUrl = useCallback((newView: AnalyticsView, newScope: AnalyticsScope) => {
    const params = new URLSearchParams();
    if (newView !== 'message') params.set('view', newView);
    if (newScope !== 'global') params.set('scope', newScope);
    const queryString = params.toString();
    router.replace(`/analytics${queryString ? `?${queryString}` : ''}`, { scroll: false });
  }, [router]);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        router.push('/login');
        return;
      }
      setAccessToken(sessionData.session.access_token);
      setIsLoading(false);
    };
    checkAuth();
  }, [router]);

  const handleDatePreset = useCallback((preset: typeof DATE_PRESETS[number]) => {
    const dates = preset.getDates();
    setDateRange({ ...dates, label: preset.label });
    setShowDatePicker(false);
  }, []);

  // Reset page and rating filter when view, date range, or scope changes
  useEffect(() => {
    setPage(1);
    setRatingFilter('');
  }, [dateRange.from, dateRange.to, scope, view]);

  // Reset page when rating filter changes
  useEffect(() => {
    setPage(1);
  }, [ratingFilter]);

  const handleExport = useCallback(async (format: 'json' | 'csv') => {
    if (!accessToken) return;

    const params = new URLSearchParams();
    if (dateRange.from) params.set('from', dateRange.from);
    if (dateRange.to) params.set('to', dateRange.to);
    params.set('format', format);
    params.set('scope', scope);
    params.set('view', view);

    try {
      const response = await fetch(`/api/feedback-analytics/export?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!response.ok) {
        console.error('Export failed');
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${view}-export-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
    }
    setShowExportMenu(false);
  }, [accessToken, dateRange, scope, view]);

  useEffect(() => {
    const fetchBundle = async () => {
      if (!accessToken) return;
      setBundleLoading(true);
      setBundleError(null);

      const params = new URLSearchParams();
      if (dateRange.from) params.set('from', dateRange.from);
      if (dateRange.to) params.set('to', dateRange.to);
      params.set('interval', 'day');
      if (ratingFilter) params.set('rating', ratingFilter);
      params.set('page', String(page));
      params.set('limit', String(limit));
      params.set('scope', scope);
      params.set('view', view);

      try {
        const response = await fetch(`/api/feedback-analytics/bundle?${params}`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch analytics data');
        }

        const result = await response.json();
        setBundle(result as AnalyticsBundle);
      } catch (err) {
        setBundleError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setBundleLoading(false);
      }
    };

    fetchBundle();
  }, [accessToken, dateRange.from, dateRange.to, ratingFilter, page, limit, scope, view]);

  if (isLoading) {
    return (
      <main className="george-analytics">
        <div className="george-analytics-loading">Loading...</div>
      </main>
    );
  }

  // Determine which data to show based on view
  const isConversation = view === 'conversation' && bundle && isConversationBundle(bundle);
  const conversationBundle = isConversation ? bundle as ConversationAnalyticsBundle : null;
  const messageBundle = !isConversation && bundle ? bundle as MessageAnalyticsBundle : null;

  return (
    <main className="george-analytics">
          <div className="george-analytics-header">
            <h1 className="george-analytics-title">Analytics Dashboard</h1>
            <div className="george-analytics-actions">
              {/* View Toggle */}
              <div className="george-analytics-view-toggle">
                <button
                  type="button"
                  className={`george-analytics-view-btn${view === 'message' ? ' is-active' : ''}`}
                  onClick={() => { setView('message'); updateUrl('message', scope); }}
                >
                  <MessageSquare size={14} />
                  <span>Per Message</span>
                </button>
                <button
                  type="button"
                  className={`george-analytics-view-btn${view === 'conversation' ? ' is-active' : ''}`}
                  onClick={() => { setView('conversation'); updateUrl('conversation', scope); }}
                >
                  <MessagesSquare size={14} />
                  <span>Per Conversation</span>
                </button>
              </div>

              {/* Scope Toggle */}
              <div className="george-analytics-scope-toggle">
                <button
                  type="button"
                  className={`george-analytics-scope-btn${scope === 'personal' ? ' is-active' : ''}`}
                  onClick={() => { setScope('personal'); updateUrl(view, 'personal'); }}
                >
                  <User size={14} />
                  <span>My Analytics</span>
                </button>
                <button
                  type="button"
                  className={`george-analytics-scope-btn${scope === 'global' ? ' is-active' : ''}`}
                  onClick={() => { setScope('global'); updateUrl(view, 'global'); }}
                >
                  <Globe size={14} />
                  <span>Global</span>
                </button>
              </div>

              {/* Date Picker */}
              <div className="george-analytics-date-picker">
                <button
                  type="button"
                  className="george-analytics-date-btn"
                  onClick={() => setShowDatePicker(!showDatePicker)}
                >
                  <Calendar size={16} />
                  <span>{dateRange.label}</span>
                  <ChevronDown size={14} />
                </button>
                {showDatePicker && (
                  <div className="george-analytics-date-dropdown">
                    {DATE_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        className={`george-analytics-date-option${dateRange.label === preset.label ? ' is-selected' : ''}`}
                        onClick={() => handleDatePreset(preset)}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Export Menu */}
              <div className="george-analytics-export">
                <button
                  type="button"
                  className="george-analytics-export-btn"
                  onClick={() => setShowExportMenu(!showExportMenu)}
                >
                  <Download size={16} />
                  <span>Export</span>
                  <ChevronDown size={14} />
                </button>
                {showExportMenu && (
                  <div className="george-analytics-export-dropdown">
                    <button
                      type="button"
                      className="george-analytics-export-option"
                      onClick={() => handleExport('csv')}
                    >
                      Export as CSV
                    </button>
                    <button
                      type="button"
                      className="george-analytics-export-option"
                      onClick={() => handleExport('json')}
                    >
                      Export as JSON
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {accessToken && (
            <>
              <AnalyticsOverview
                data={bundle?.overview ?? null}
                isLoading={bundleLoading}
                error={bundleError}
                view={view}
              />

              <AnalyticsTrends
                data={bundle?.trends ?? []}
                isLoading={bundleLoading}
                error={bundleError}
                view={view}
              />

              <div className="george-analytics-row">
                {view === 'conversation' ? (
                  <AnalyticsCategories
                    data={conversationBundle?.categories ?? []}
                    isLoading={bundleLoading}
                    error={bundleError}
                  />
                ) : (
                  <AnalyticsTags
                    data={messageBundle?.tags ?? []}
                    isLoading={bundleLoading}
                    error={bundleError}
                  />
                )}
              </div>

              <AnalyticsFeedbackList
                data={
                  view === 'conversation'
                    ? conversationBundle?.feedback_list?.conversations ?? []
                    : messageBundle?.feedback_list?.interactions ?? []
                }
                isLoading={bundleLoading}
                error={bundleError}
                page={page}
                limit={limit}
                ratingFilter={ratingFilter}
                onRatingFilterChange={setRatingFilter}
                onPageChange={setPage}
                view={view}
              />
            </>
          )}
    </main>
  );
}
