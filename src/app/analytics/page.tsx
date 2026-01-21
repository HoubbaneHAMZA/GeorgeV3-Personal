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
                accessToken={accessToken}
                from={dateRange.from}
                to={dateRange.to}
              />

              <AnalyticsTrends
                accessToken={accessToken}
                from={dateRange.from}
                to={dateRange.to}
              />

              <div className="george-analytics-row">
                <AnalyticsTags
                  accessToken={accessToken}
                  from={dateRange.from}
                  to={dateRange.to}
                />
              </div>

              <AnalyticsFeedbackList
                accessToken={accessToken}
                from={dateRange.from}
                to={dateRange.to}
              />
            </>
          )}
    </main>
  );
}
