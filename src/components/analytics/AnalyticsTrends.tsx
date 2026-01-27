'use client';

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

type AnalyticsView = 'message' | 'conversation';

type MessageTrendData = {
  date: string;
  total: number;
  unusable: number;
  problematic: number;
  usable: number;
  good: number;
  perfect: number;
};

type ConversationTrendData = {
  date: string;
  total: number;
  solved: number;
  partially_solved: number;
  not_solved: number;
};

type TrendData = MessageTrendData | ConversationTrendData;

type AnalyticsTrendsProps = {
  data: TrendData[];
  isLoading: boolean;
  error: string | null;
  view?: AnalyticsView;
};

function isConversationTrendData(data: TrendData): data is ConversationTrendData {
  return 'solved' in data;
}

export default function AnalyticsTrends({ data, isLoading, error, view = 'message' }: AnalyticsTrendsProps) {

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (isLoading) {
    return (
      <div className="george-analytics-trends">
        <div className="george-analytics-section-header">
          <h2 className="george-analytics-section-title">
            {view === 'conversation' ? 'Conversation Trends' : 'Feedback Trends'}
          </h2>
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
          <h2 className="george-analytics-section-title">
            {view === 'conversation' ? 'Conversation Trends' : 'Feedback Trends'}
          </h2>
        </div>
        <div className="george-analytics-error">{error}</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="george-analytics-trends">
        <div className="george-analytics-section-header">
          <h2 className="george-analytics-section-title">
            {view === 'conversation' ? 'Conversation Trends' : 'Feedback Trends'}
          </h2>
        </div>
        <div className="george-analytics-empty">No trend data available for this period.</div>
      </div>
    );
  }

  // Conversation view
  if (view === 'conversation' && data.length > 0 && isConversationTrendData(data[0])) {
    return (
      <div className="george-analytics-trends">
        <div className="george-analytics-section-header">
          <h2 className="george-analytics-section-title">Conversation Trends</h2>
        </div>
        <div className="george-analytics-chart">
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorSolved" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorPartial" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#eab308" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorNotSolved" x1="0" y1="0" x2="0" y2="1">
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
                dataKey="solved"
                name="Solved"
                stroke="#22c55e"
                fillOpacity={1}
                fill="url(#colorSolved)"
                stackId="1"
              />
              <Area
                type="monotone"
                dataKey="partially_solved"
                name="Partially Solved"
                stroke="#eab308"
                fillOpacity={1}
                fill="url(#colorPartial)"
                stackId="1"
              />
              <Area
                type="monotone"
                dataKey="not_solved"
                name="Not Solved"
                stroke="#ef4444"
                fillOpacity={1}
                fill="url(#colorNotSolved)"
                stackId="1"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // Message view (default)
  return (
    <div className="george-analytics-trends">
      <div className="george-analytics-section-header">
        <h2 className="george-analytics-section-title">Feedback Trends</h2>
      </div>
      <div className="george-analytics-chart">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorPerfect" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorGood" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorUsable" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#eab308" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorProblematic" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorUnusable" x1="0" y1="0" x2="0" y2="1">
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
              dataKey="perfect"
              name="Perfect"
              stroke="#14b8a6"
              fillOpacity={1}
              fill="url(#colorPerfect)"
              stackId="1"
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
              dataKey="usable"
              name="Usable"
              stroke="#eab308"
              fillOpacity={1}
              fill="url(#colorUsable)"
              stackId="1"
            />
            <Area
              type="monotone"
              dataKey="problematic"
              name="Problematic"
              stroke="#f97316"
              fillOpacity={1}
              fill="url(#colorProblematic)"
              stackId="1"
            />
            <Area
              type="monotone"
              dataKey="unusable"
              name="Unusable"
              stroke="#ef4444"
              fillOpacity={1}
              fill="url(#colorUnusable)"
              stackId="1"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
