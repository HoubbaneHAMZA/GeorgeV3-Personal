'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AnalyticsOverview from '@/components/analytics/AnalyticsOverview';
import AnalyticsTrends from '@/components/analytics/AnalyticsTrends';
import AnalyticsTags from '@/components/analytics/AnalyticsTags';
import AnalyticsCategories from '@/components/analytics/AnalyticsCategories';
import AnalyticsFeedbackList from '@/components/analytics/AnalyticsFeedbackList';
import { Download, Calendar, ChevronDown, User, Globe, MessageSquare, MessagesSquare, RefreshCw, BarChart3, Layers, DollarSign, ThumbsUp } from 'lucide-react';
import { useAnalyticsBundle, isConversationBundle, type AnalyticsBundle } from '@/hooks/useAnalyticsBundle';
import { useAccessToken } from '@/hooks/useAccessToken';

type AnalyticsView = 'message' | 'conversation' | 'all';
type AnalyticsScope = 'global' | 'personal';
type MetricType = 'usage' | 'feedback';

type DateRange = {
  from: string;
  to: string;
  label: string;
};

type MessageAnalyticsBundle = Extract<AnalyticsBundle, { tags: unknown }>;
type ConversationAnalyticsBundle = Extract<AnalyticsBundle, { categories: unknown }>;

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

const ANALYTICS_PREFS_KEY = 'george-analytics-preferences';

export default function AnalyticsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const accessToken = useAccessToken();
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const preset = DATE_PRESETS[1]; // Default to last 30 days
    const dates = preset.getDates();
    return { ...dates, label: preset.label };
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [ratingFilter, setRatingFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  // Read initial values from URL params, then localStorage, then defaults
  const urlView = searchParams.get('view');
  const urlScope = searchParams.get('scope');
  const urlMetric = searchParams.get('metric');
  const [scope, setScope] = useState<AnalyticsScope>(() => {
    if (urlScope === 'personal' || urlScope === 'global') return urlScope;
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(ANALYTICS_PREFS_KEY);
        if (saved) {
          const prefs = JSON.parse(saved);
          if (prefs.scope === 'personal' || prefs.scope === 'global') return prefs.scope;
        }
      } catch {}
    }
    return 'global';
  });
  const [view, setView] = useState<AnalyticsView>(() => {
    if (urlView === 'message' || urlView === 'conversation' || urlView === 'all') return urlView;
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(ANALYTICS_PREFS_KEY);
        if (saved) {
          const prefs = JSON.parse(saved);
          if (prefs.view === 'message' || prefs.view === 'conversation' || prefs.view === 'all') return prefs.view;
        }
      } catch {}
    }
    return 'message';
  });
  const [metricType, setMetricType] = useState<MetricType>(() => {
    if (urlMetric === 'usage' || urlMetric === 'feedback') return urlMetric;
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(ANALYTICS_PREFS_KEY);
        if (saved) {
          const prefs = JSON.parse(saved);
          if (prefs.metricType === 'usage' || prefs.metricType === 'feedback') return prefs.metricType;
        }
      } catch {}
    }
    return 'feedback';
  });
  const limit = 10;

  // Save preferences to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem(ANALYTICS_PREFS_KEY, JSON.stringify({ view, scope, metricType }));
    } catch {}
  }, [view, scope, metricType]);

  // For API calls, use 'message' when view is 'all' (cost data comes from message analytics)
  const apiView = view === 'all' ? 'message' : view;

  // Use SWR for data fetching with caching
  const { bundle, isLoading: bundleLoading, error: bundleError, refresh } = useAnalyticsBundle({
    accessToken,
    from: dateRange.from,
    to: dateRange.to,
    view: apiView,
    scope,
    metricType,
    ratingFilter,
    page,
    limit
  });

  // Update URL when view, scope, or metric changes
  const updateUrl = useCallback((newView: AnalyticsView, newScope: AnalyticsScope, newMetric?: MetricType) => {
    const params = new URLSearchParams();
    if (newView !== 'message') params.set('view', newView);
    if (newScope !== 'global') params.set('scope', newScope);
    const metric = newMetric ?? metricType;
    if (metric !== 'feedback') params.set('metric', metric);
    const queryString = params.toString();
    router.replace(`/analytics${queryString ? `?${queryString}` : ''}`, { scroll: false });
  }, [router, metricType]);

  // Handle metric type change with auto-switch from 'all' when switching to feedback
  const handleMetricChange = useCallback((newMetric: MetricType) => {
    setMetricType(newMetric);
    if (newMetric === 'feedback' && view === 'all') {
      setView('message');
      updateUrl('message', scope, 'feedback');
    } else {
      updateUrl(view, scope, newMetric);
    }
  }, [view, scope, updateUrl]);

  const handleDatePreset = useCallback((preset: typeof DATE_PRESETS[number]) => {
    const dates = preset.getDates();
    setDateRange({ ...dates, label: preset.label });
    setShowDatePicker(false);
  }, []);

  // Reset page and rating filter when view, date range, scope, or metric changes
  useEffect(() => {
    setPage(1);
    setRatingFilter('');
  }, [dateRange.from, dateRange.to, scope, view, metricType]);

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
    params.set('view', apiView);
    params.set('metric', metricType);

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


  // Determine which data to show based on view
  const isConversation = apiView === 'conversation' && bundle && isConversationBundle(bundle);
  const conversationBundle = isConversation ? bundle as ConversationAnalyticsBundle : null;
  const messageBundle = !isConversation && bundle ? bundle as MessageAnalyticsBundle : null;

  return (
    <main className="george-analytics">
          <section className="george-docs-hero">
            <BarChart3 size={48} className="george-docs-hero-icon" />
            <div>
              <h2>Analytics</h2>
              <p>Track usage metrics, feedback trends, and performance insights across conversations.</p>
            </div>
          </section>

          <div className="george-analytics-header">
            <div className="george-analytics-actions">
              {/* Metric Toggle */}
              <div className="george-analytics-metric-toggle">
                <button
                  type="button"
                  className={`george-analytics-metric-btn${metricType === 'usage' ? ' is-active' : ''}`}
                  onClick={() => handleMetricChange('usage')}
                >
                  <DollarSign size={14} />
                  <span>Usage</span>
                </button>
                <button
                  type="button"
                  className={`george-analytics-metric-btn${metricType === 'feedback' ? ' is-active' : ''}`}
                  onClick={() => handleMetricChange('feedback')}
                >
                  <ThumbsUp size={14} />
                  <span>Feedback</span>
                </button>
              </div>

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
                <button
                  type="button"
                  className={`george-analytics-view-btn${view === 'all' ? ' is-active' : ''}${metricType === 'feedback' ? ' is-disabled' : ''}`}
                  onClick={() => { if (metricType === 'usage') { setView('all'); updateUrl('all', scope); } }}
                  title={metricType === 'feedback' ? 'Switch to Usage to enable this view' : 'View total daily cost'}
                >
                  <Layers size={14} />
                  <span>All</span>
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

              {/* Refresh Button */}
              <button
                type="button"
                className={`george-analytics-refresh-btn${isManualRefreshing ? ' is-refreshing' : ''}`}
                onClick={async () => {
                  setIsManualRefreshing(true);
                  await refresh();
                  setIsManualRefreshing(false);
                }}
                disabled={isManualRefreshing}
                title="Refresh data"
              >
                <RefreshCw size={16} className={isManualRefreshing ? 'spin' : ''} />
              </button>
            </div>
          </div>

          {accessToken && (
            <>
              {/* Only show overview cards in feedback mode */}
              {metricType === 'feedback' && (
                <AnalyticsOverview
                  data={bundle?.overview ?? null}
                  isLoading={bundleLoading}
                  error={bundleError}
                  view={view}
                />
              )}

              <AnalyticsTrends
                data={bundle?.trends ?? []}
                costData={bundle?.costTrends ?? []}
                isLoading={bundleLoading}
                error={bundleError}
                view={view}
                metricType={metricType}
              />

              {/* Only show tags/categories and feedback list when in feedback mode */}
              {metricType === 'feedback' && (
                <>
                  <div className="george-analytics-row">
                    {apiView === 'conversation' ? (
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
                      apiView === 'conversation'
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
                    view={apiView}
                  />
                </>
              )}
            </>
          )}
    </main>
  );
}
