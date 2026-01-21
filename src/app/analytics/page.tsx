'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import AnalyticsOverview from '@/components/analytics/AnalyticsOverview';
import AnalyticsTrends from '@/components/analytics/AnalyticsTrends';
import AnalyticsTags from '@/components/analytics/AnalyticsTags';
import AnalyticsFeedbackList from '@/components/analytics/AnalyticsFeedbackList';
import { Download, Calendar, ChevronDown } from 'lucide-react';

type DateRange = {
  from: string;
  to: string;
  label: string;
};

type OverviewData = {
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

type TrendData = {
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

type AnalyticsBundle = {
  overview: OverviewData;
  trends: TrendData[];
  tags: TagData[];
  feedback_list: {
    interactions: FeedbackItem[];
    page: number;
    limit: number;
  };
};

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
  const limit = 10;

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

  useEffect(() => {
    setPage(1);
  }, [dateRange.from, dateRange.to, ratingFilter]);

  const handleExport = useCallback(async (format: 'json' | 'csv') => {
    if (!accessToken) return;

    const params = new URLSearchParams();
    if (dateRange.from) params.set('from', dateRange.from);
    if (dateRange.to) params.set('to', dateRange.to);
    params.set('format', format);

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
      a.download = `feedback-export-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
    }
    setShowExportMenu(false);
  }, [accessToken, dateRange]);

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
  }, [accessToken, dateRange.from, dateRange.to, ratingFilter, page, limit]);

  if (isLoading) {
    return (
      <main className="george-analytics">
        <div className="george-analytics-loading">Loading...</div>
      </main>
    );
  }

  return (
    <main className="george-analytics">
          <div className="george-analytics-header">
            <h1 className="george-analytics-title">Analytics Dashboard</h1>
            <div className="george-analytics-actions">
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
              />

              <AnalyticsTrends
                data={bundle?.trends ?? []}
                isLoading={bundleLoading}
                error={bundleError}
              />

              <div className="george-analytics-row">
                <AnalyticsTags
                  data={bundle?.tags ?? []}
                  isLoading={bundleLoading}
                  error={bundleError}
                />
              </div>

              <AnalyticsFeedbackList
                data={bundle?.feedback_list?.interactions ?? []}
                isLoading={bundleLoading}
                error={bundleError}
                page={page}
                limit={limit}
                ratingFilter={ratingFilter}
                onRatingFilterChange={setRatingFilter}
                onPageChange={setPage}
              />
            </>
          )}
    </main>
  );
}
