'use client';

import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';

type AnalyticsView = 'message' | 'conversation' | 'all';
type MetricType = 'usage' | 'feedback';

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

type CostTrendData = {
  date: string;
  total_cost: number;
  total_runs?: number;
  total_conversations?: number;
};

type TrendData = MessageTrendData | ConversationTrendData;

type AnalyticsTrendsProps = {
  data: TrendData[];
  costData?: CostTrendData[];
  isLoading: boolean;
  error: string | null;
  view?: AnalyticsView;
  metricType?: MetricType;
};

function isConversationTrendData(data: TrendData): data is ConversationTrendData {
  return 'solved' in data;
}

// Custom tooltip for usage charts
function UsageTooltip({ active, payload, label, view }: {
  active?: boolean;
  payload?: Array<{ value: number; payload: CostTrendData }>;
  label?: string;
  view: AnalyticsView;
}) {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatCost = (cost: number) => `$${cost.toFixed(4)}`;

  if (view === 'all') {
    return (
      <div style={{
        backgroundColor: 'var(--page-bg)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '8px 12px',
        fontSize: '12px'
      }}>
        <p style={{ margin: 0, fontWeight: 600 }}>{formatDate(label || '')}</p>
        <p style={{ margin: '4px 0 0', color: 'var(--muted)' }}>
          Total Cost: <span style={{ color: '#2563eb', fontWeight: 600 }}>{formatCost(data.total_cost)}</span>
        </p>
      </div>
    );
  }

  if (view === 'conversation') {
    const count = data.total_conversations || 0;
    const avgCost = count > 0 ? data.total_cost / count : 0;
    return (
      <div style={{
        backgroundColor: 'var(--page-bg)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '8px 12px',
        fontSize: '12px'
      }}>
        <p style={{ margin: 0, fontWeight: 600 }}>{formatDate(label || '')}</p>
        <p style={{ margin: '4px 0 0', color: 'var(--muted)' }}>
          Avg Cost: <span style={{ color: '#2563eb', fontWeight: 600 }}>{formatCost(avgCost)}</span>/conversation
        </p>
        <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '11px' }}>
          ({count} conversations, {formatCost(data.total_cost)} total)
        </p>
      </div>
    );
  }

  // Message view
  const count = data.total_runs || 0;
  const avgCost = count > 0 ? data.total_cost / count : 0;
  return (
    <div style={{
      backgroundColor: 'var(--page-bg)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      padding: '8px 12px',
      fontSize: '12px'
    }}>
      <p style={{ margin: 0, fontWeight: 600 }}>{formatDate(label || '')}</p>
      <p style={{ margin: '4px 0 0', color: 'var(--muted)' }}>
        Avg Cost: <span style={{ color: '#2563eb', fontWeight: 600 }}>{formatCost(avgCost)}</span>/message
      </p>
      <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '11px' }}>
        ({count} messages, {formatCost(data.total_cost)} total)
      </p>
    </div>
  );
}

export default function AnalyticsTrends({
  data,
  costData = [],
  isLoading,
  error,
  view = 'message',
  metricType = 'feedback'
}: AnalyticsTrendsProps) {

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Determine the title based on view and metric
  const getTitle = () => {
    if (metricType === 'usage') {
      if (view === 'all') return 'Daily Cost Trends';
      if (view === 'conversation') return 'Cost per Conversation';
      return 'Cost per Message';
    }
    return view === 'conversation' ? 'Conversation Trends' : 'Feedback Trends';
  };

  // Check if we have data based on metric type
  const hasData = metricType === 'usage' ? costData.length > 0 : data.length > 0;

  if (isLoading) {
    return (
      <div className="george-analytics-trends">
        <div className="george-analytics-section-header">
          <h2 className="george-analytics-section-title">{getTitle()}</h2>
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
          <h2 className="george-analytics-section-title">{getTitle()}</h2>
        </div>
        <div className="george-analytics-error">{error}</div>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="george-analytics-trends">
        <div className="george-analytics-section-header">
          <h2 className="george-analytics-section-title">{getTitle()}</h2>
        </div>
        <div className="george-analytics-empty">No trend data available for this period.</div>
      </div>
    );
  }

  // USAGE VIEW - Show cost charts
  if (metricType === 'usage') {
    // Transform data based on view
    const chartData = costData.map(d => {
      if (view === 'all') {
        return { date: d.date, value: d.total_cost, ...d };
      }
      if (view === 'conversation') {
        const count = d.total_conversations || 0;
        return { date: d.date, value: count > 0 ? d.total_cost / count : 0, ...d };
      }
      // Message view
      const count = d.total_runs || 0;
      return { date: d.date, value: count > 0 ? d.total_cost / count : 0, ...d };
    });

    const formatYAxis = (value: number) => {
      if (value === 0) return '$0';
      if (value < 0.01) return `$${value.toFixed(4)}`;
      if (value < 1) return `$${value.toFixed(3)}`;
      return `$${value.toFixed(2)}`;
    };

    return (
      <div className="george-analytics-trends">
        <div className="george-analytics-section-header">
          <h2 className="george-analytics-section-title">{getTitle()}</h2>
        </div>
        <div className="george-analytics-chart">
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
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
                tickFormatter={formatYAxis}
                tick={{ fontSize: 12, fill: 'var(--muted)' }}
                stroke="var(--border)"
                width={60}
              />
              <Tooltip content={<UsageTooltip view={view} />} />
              <Area
                type="monotone"
                dataKey="value"
                name={view === 'all' ? 'Total Cost' : 'Avg Cost'}
                stroke="#2563eb"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorCost)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // FEEDBACK VIEW - Conversation feedback trends
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

  // FEEDBACK VIEW - Message feedback trends (default)
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
