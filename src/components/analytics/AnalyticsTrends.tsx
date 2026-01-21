'use client';

import { useEffect, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';

type TrendData = {
  date: string;
  total: number;
  good: number;
  okay: number;
  bad: number;
};

type AnalyticsTrendsProps = {
  accessToken: string;
  from: string;
  to: string;
};

export default function AnalyticsTrends({ accessToken, from, to }: AnalyticsTrendsProps) {
  const [data, setData] = useState<TrendData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      params.set('interval', 'day');

      try {
        const response = await fetch(`/api/feedback-analytics/stats/trends?${params}`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch trends data');
        }

        const result = await response.json();
        setData(result.trends || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [accessToken, from, to]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (isLoading) {
    return (
      <div className="george-analytics-trends">
        <div className="george-analytics-section-header">
          <h2 className="george-analytics-section-title">Feedback Trends</h2>
        </div>
        <div className="george-analytics-chart-loading">
          <div className="george-analytics-chart-skeleton" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="george-analytics-trends">
        <div className="george-analytics-section-header">
          <h2 className="george-analytics-section-title">Feedback Trends</h2>
        </div>
        <div className="george-analytics-error">{error}</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="george-analytics-trends">
        <div className="george-analytics-section-header">
          <h2 className="george-analytics-section-title">Feedback Trends</h2>
        </div>
        <div className="george-analytics-empty">No trend data available for this period.</div>
      </div>
    );
  }

  return (
    <div className="george-analytics-trends">
      <div className="george-analytics-section-header">
        <h2 className="george-analytics-section-title">Feedback Trends</h2>
      </div>
      <div className="george-analytics-chart">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorGood" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorOkay" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#eab308" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorBad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fontSize: 12, fill: 'var(--muted)' }}
              stroke="var(--border)"
            />
            <YAxis
              tick={{ fontSize: 12, fill: 'var(--muted)' }}
              stroke="var(--border)"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--page-bg)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                fontSize: '12px'
              }}
              labelFormatter={formatDate}
            />
            <Legend
              wrapperStyle={{ fontSize: '12px' }}
            />
            <Area
              type="monotone"
              dataKey="good"
              name="Good"
              stroke="#22c55e"
              fillOpacity={1}
              fill="url(#colorGood)"
              stackId="1"
            />
            <Area
              type="monotone"
              dataKey="okay"
              name="Okay"
              stroke="#eab308"
              fillOpacity={1}
              fill="url(#colorOkay)"
              stackId="1"
            />
            <Area
              type="monotone"
              dataKey="bad"
              name="Bad"
              stroke="#ef4444"
              fillOpacity={1}
              fill="url(#colorBad)"
              stackId="1"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
