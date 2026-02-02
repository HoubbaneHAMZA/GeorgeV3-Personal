'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ComposedChart,
  Bar
} from 'recharts';

type AnalyticsView = 'message' | 'conversation' | 'all';
type MetricType = 'usage' | 'feedback';

type MessageTrendData = {
  date: string;
  total: number;
  feedback_count: number;
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

function isMessageTrendData(data: TrendData): data is MessageTrendData {
  return 'perfect' in data;
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

// Custom tooltip for volume chart
function VolumeTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload || !payload.length) return null;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const messages = payload.find(p => p.dataKey === 'total')?.value || 0;
  const feedback = payload.find(p => p.dataKey === 'feedback_count')?.value || 0;
  const rate = messages > 0 ? ((feedback / messages) * 100).toFixed(1) : '0';

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
        Messages: <span style={{ color: '#94a3b8', fontWeight: 600 }}>{messages}</span>
      </p>
      <p style={{ margin: '4px 0 0', color: 'var(--muted)' }}>
        Feedback: <span style={{ color: '#1e293b', fontWeight: 600 }}>{feedback}</span>
        <span style={{ marginLeft: '4px', fontSize: '11px', color: '#64748b' }}>({rate}%)</span>
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
    return 'Volume & Quality Analysis';
  };

  // Check if we have data based on metric type
  const hasData = metricType === 'usage' ? costData.length > 0 : data.length > 0;

  // Calculate totals for message view
  const totalMessages = data.reduce((sum, d) => sum + (d.total || 0), 0);
  const totalFeedback = data.reduce((sum, d) => {
    if (isMessageTrendData(d)) {
      return sum + (d.feedback_count || 0);
    }
    return sum;
  }, 0);
  const feedbackRate = totalMessages > 0 ? ((totalFeedback / totalMessages) * 100).toFixed(1) : '0';

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
        return { ...d, value: d.total_cost };
      }
      if (view === 'conversation') {
        const count = d.total_conversations || 0;
        return { ...d, value: count > 0 ? d.total_cost / count : 0 };
      }
      // Message view
      const count = d.total_runs || 0;
      return { ...d, value: count > 0 ? d.total_cost / count : 0 };
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

  // FEEDBACK VIEW - Conversation feedback trends with Activity Volume
  if (view === 'conversation' && data.length > 0 && isConversationTrendData(data[0])) {
    // Calculate totals for conversation view
    const totalConversations = data.reduce((sum, d) => sum + (d.total || 0), 0);
    const totalRated = data.reduce((sum, d) => {
      if (isConversationTrendData(d)) {
        return sum + (d.solved || 0) + (d.partially_solved || 0) + (d.not_solved || 0);
      }
      return sum;
    }, 0);
    const ratedRate = totalConversations > 0 ? ((totalRated / totalConversations) * 100).toFixed(1) : '0';

    return (
      <div className="george-analytics-trends george-analytics-trends-combined">
        <div className="george-analytics-section-header">
          <h2 className="george-analytics-section-title">Volume & Quality Analysis</h2>
          <span className="george-analytics-section-subtitle">Conversation activity and resolution distribution over time</span>
        </div>

        {/* Activity Volume Section */}
        <div className="george-analytics-subsection">
          <div className="george-analytics-subsection-header">
            <div className="george-analytics-subsection-left">
              <span className="george-analytics-subsection-title">Activity Volume</span>
              <div className="george-analytics-legend-inline">
                <span className="george-analytics-legend-item">
                  <span className="george-analytics-legend-dot" style={{ background: '#cbd5e1' }} />
                  Conversations
                </span>
                <span className="george-analytics-legend-item">
                  <span className="george-analytics-legend-dot" style={{ background: '#1e293b' }} />
                  Rated
                </span>
              </div>
            </div>
            <div className="george-analytics-volume-stats">
              <span className="george-analytics-vol-stat"><strong>{totalConversations.toLocaleString()}</strong> conversations</span>
              <span className="george-analytics-vol-sep">·</span>
              <span className="george-analytics-vol-stat"><strong>{totalRated.toLocaleString()}</strong> rated</span>
              <span className="george-analytics-vol-pct">({ratedRate}%)</span>
            </div>
          </div>
          <div className="george-analytics-chart george-analytics-chart-sm">
            <ResponsiveContainer width="100%" height={120}>
              <ComposedChart
                data={data.map(d => {
                  if (!isConversationTrendData(d)) return d;
                  const rated = (d.solved || 0) + (d.partially_solved || 0) + (d.not_solved || 0);
                  return { ...d, rated_count: rated };
                })}
                margin={{ top: 5, right: 30, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorConversations" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#cbd5e1" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#cbd5e1" stopOpacity={0.2} />
                  </linearGradient>
                  <linearGradient id="colorRated" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1e293b" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#1e293b" stopOpacity={0.2} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  tick={{ fontSize: 10, fill: 'var(--muted)' }}
                  stroke="var(--border)"
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--muted)' }}
                  stroke="var(--border)"
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || !payload.length) return null;
                    const convs = payload.find(p => p.dataKey === 'total')?.value || 0;
                    const rated = payload.find(p => p.dataKey === 'rated_count')?.value || 0;
                    const rate = Number(convs) > 0 ? ((Number(rated) / Number(convs)) * 100).toFixed(1) : '0';
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
                          Conversations: <span style={{ color: '#94a3b8', fontWeight: 600 }}>{convs}</span>
                        </p>
                        <p style={{ margin: '4px 0 0', color: 'var(--muted)' }}>
                          Rated: <span style={{ color: '#1e293b', fontWeight: 600 }}>{rated}</span>
                          <span style={{ marginLeft: '4px', fontSize: '11px', color: '#64748b' }}>({rate}%)</span>
                        </p>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  name="Conversations"
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                  fillOpacity={1}
                  fill="url(#colorConversations)"
                />
                <Area
                  type="monotone"
                  dataKey="rated_count"
                  name="Rated"
                  stroke="#1e293b"
                  strokeWidth={1.5}
                  fillOpacity={1}
                  fill="url(#colorRated)"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="george-analytics-divider" />

        {/* Resolution Distribution Section - 100% Stacked Area Chart */}
        <div className="george-analytics-subsection">
          <div className="george-analytics-subsection-header">
            <div className="george-analytics-subsection-left">
              <span className="george-analytics-subsection-title">Resolution Distribution</span>
              <span className="george-analytics-chart-unit">% of rated conversations</span>
            </div>
            <div className="george-analytics-legend-inline george-analytics-legend-compact">
              <span className="george-analytics-legend-mini"><span className="george-analytics-legend-dot" style={{ background: '#22c55e' }} />SOLVED</span>
              <span className="george-analytics-legend-mini"><span className="george-analytics-legend-dot" style={{ background: '#eab308' }} />PARTIAL</span>
              <span className="george-analytics-legend-mini"><span className="george-analytics-legend-dot" style={{ background: '#ef4444' }} />NOT SOLVED</span>
            </div>
          </div>
          <div className="george-analytics-chart">
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart
                data={data.map(d => {
                  if (!isConversationTrendData(d)) return d;
                  const total = (d.solved || 0) + (d.partially_solved || 0) + (d.not_solved || 0);
                  if (total === 0) return { ...d, solvedPct: 0, partialPct: 0, notSolvedPct: 0 };
                  return {
                    ...d,
                    notSolvedPct: (d.not_solved / total) * 100,
                    partialPct: (d.partially_solved / total) * 100,
                    solvedPct: (d.solved / total) * 100
                  };
                })}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  tick={{ fontSize: 10, fill: 'var(--muted)' }}
                  stroke="var(--border)"
                  axisLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 10, fill: 'var(--muted)' }}
                  stroke="var(--border)"
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || !payload.length) return null;
                    const d = payload[0]?.payload;
                    if (!d) return null;
                    return (
                      <div style={{
                        backgroundColor: 'var(--page-bg)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        fontSize: '12px'
                      }}>
                        <p style={{ margin: 0, fontWeight: 600 }}>{formatDate(label || '')}</p>
                        <p style={{ margin: '4px 0 0', color: '#22c55e' }}>Solved: {d.solved} ({d.solvedPct?.toFixed(1)}%)</p>
                        <p style={{ margin: '2px 0 0', color: '#eab308' }}>Partial: {d.partially_solved} ({d.partialPct?.toFixed(1)}%)</p>
                        <p style={{ margin: '2px 0 0', color: '#ef4444' }}>Not Solved: {d.not_solved} ({d.notSolvedPct?.toFixed(1)}%)</p>
                      </div>
                    );
                  }}
                />
                {/* Stack order: bottom to top = Not Solved → Partial → Solved */}
                <Area
                  type="monotone"
                  dataKey="notSolvedPct"
                  name="Not Solved"
                  stroke="#ef4444"
                  strokeWidth={0}
                  fillOpacity={0.85}
                  fill="#ef4444"
                  stackId="resolution"
                />
                <Area
                  type="monotone"
                  dataKey="partialPct"
                  name="Partial"
                  stroke="#eab308"
                  strokeWidth={0}
                  fillOpacity={0.85}
                  fill="#eab308"
                  stackId="resolution"
                />
                <Area
                  type="monotone"
                  dataKey="solvedPct"
                  name="Solved"
                  stroke="#22c55e"
                  strokeWidth={0}
                  fillOpacity={0.85}
                  fill="#22c55e"
                  stackId="resolution"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  }

  // FEEDBACK VIEW - Message feedback trends with Activity Volume
  return (
    <div className="george-analytics-trends george-analytics-trends-combined">
      <div className="george-analytics-section-header">
        <h2 className="george-analytics-section-title">Volume & Quality Analysis</h2>
        <span className="george-analytics-section-subtitle">Message activity and rating distribution over time</span>
      </div>

      {/* Activity Volume Section */}
      <div className="george-analytics-subsection">
        <div className="george-analytics-subsection-header">
          <div className="george-analytics-subsection-left">
            <span className="george-analytics-subsection-title">Activity Volume</span>
            <div className="george-analytics-legend-inline">
              <span className="george-analytics-legend-item">
                <span className="george-analytics-legend-dot" style={{ background: '#cbd5e1' }} />
                Messages
              </span>
              <span className="george-analytics-legend-item">
                <span className="george-analytics-legend-dot" style={{ background: '#1e293b' }} />
                Feedback
              </span>
            </div>
          </div>
          <div className="george-analytics-volume-stats">
            <span className="george-analytics-vol-stat"><strong>{totalMessages.toLocaleString()}</strong> messages</span>
            <span className="george-analytics-vol-sep">·</span>
            <span className="george-analytics-vol-stat"><strong>{totalFeedback.toLocaleString()}</strong> feedback</span>
            <span className="george-analytics-vol-pct">({feedbackRate}%)</span>
          </div>
        </div>
        <div className="george-analytics-chart george-analytics-chart-sm">
          <ResponsiveContainer width="100%" height={120}>
            <ComposedChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorMessages" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#cbd5e1" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#cbd5e1" stopOpacity={0.2} />
                </linearGradient>
                <linearGradient id="colorFeedback" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1e293b" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#1e293b" stopOpacity={0.2} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 10, fill: 'var(--muted)' }}
                stroke="var(--border)"
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--muted)' }}
                stroke="var(--border)"
                axisLine={false}
                tickLine={false}
                width={30}
              />
              <Tooltip content={<VolumeTooltip />} />
              <Area
                type="monotone"
                dataKey="total"
                name="Messages"
                stroke="#94a3b8"
                strokeWidth={1.5}
                fillOpacity={1}
                fill="url(#colorMessages)"
              />
              <Area
                type="monotone"
                dataKey="feedback_count"
                name="Feedback"
                stroke="#1e293b"
                strokeWidth={1.5}
                fillOpacity={1}
                fill="url(#colorFeedback)"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="george-analytics-divider" />

      {/* Rating Distribution Section - 100% Stacked Area Chart */}
      <div className="george-analytics-subsection">
        <div className="george-analytics-subsection-header">
          <div className="george-analytics-subsection-left">
            <span className="george-analytics-subsection-title">Rating Distribution</span>
            <span className="george-analytics-chart-unit">% of rated messages</span>
          </div>
          <div className="george-analytics-legend-inline george-analytics-legend-compact">
            <span className="george-analytics-legend-mini"><span className="george-analytics-legend-dot" style={{ background: '#0d9488' }} />PERFECT</span>
            <span className="george-analytics-legend-mini"><span className="george-analytics-legend-dot" style={{ background: '#22c55e' }} />GOOD</span>
            <span className="george-analytics-legend-mini"><span className="george-analytics-legend-dot" style={{ background: '#eab308' }} />USABLE</span>
            <span className="george-analytics-legend-mini"><span className="george-analytics-legend-dot" style={{ background: '#f97316' }} />PROBLEMATIC</span>
            <span className="george-analytics-legend-mini"><span className="george-analytics-legend-dot" style={{ background: '#ef4444' }} />UNUSABLE</span>
          </div>
        </div>
        <div className="george-analytics-chart">
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart
              data={data.map(d => {
                if (!isMessageTrendData(d)) return d;
                const total = d.perfect + d.good + d.usable + d.problematic + d.unusable;
                if (total === 0) return { ...d, perfectPct: 0, goodPct: 0, usablePct: 0, problematicPct: 0, unusablePct: 0 };
                return {
                  ...d,
                  unusablePct: (d.unusable / total) * 100,
                  problematicPct: (d.problematic / total) * 100,
                  usablePct: (d.usable / total) * 100,
                  goodPct: (d.good / total) * 100,
                  perfectPct: (d.perfect / total) * 100
                };
              })}
              margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 10, fill: 'var(--muted)' }}
                stroke="var(--border)"
                axisLine={false}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 10, fill: 'var(--muted)' }}
                stroke="var(--border)"
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || !payload.length) return null;
                  const d = payload[0]?.payload;
                  if (!d) return null;
                  return (
                    <div style={{
                      backgroundColor: 'var(--page-bg)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontSize: '12px'
                    }}>
                      <p style={{ margin: 0, fontWeight: 600 }}>{formatDate(label || '')}</p>
                      <p style={{ margin: '4px 0 0', color: '#0d9488' }}>Perfect: {d.perfect} ({d.perfectPct?.toFixed(1)}%)</p>
                      <p style={{ margin: '2px 0 0', color: '#22c55e' }}>Good: {d.good} ({d.goodPct?.toFixed(1)}%)</p>
                      <p style={{ margin: '2px 0 0', color: '#eab308' }}>Usable: {d.usable} ({d.usablePct?.toFixed(1)}%)</p>
                      <p style={{ margin: '2px 0 0', color: '#f97316' }}>Problematic: {d.problematic} ({d.problematicPct?.toFixed(1)}%)</p>
                      <p style={{ margin: '2px 0 0', color: '#ef4444' }}>Unusable: {d.unusable} ({d.unusablePct?.toFixed(1)}%)</p>
                    </div>
                  );
                }}
              />
              {/* Stack order: bottom to top = Unusable → Problematic → Usable → Good → Perfect */}
              <Area
                type="monotone"
                dataKey="unusablePct"
                name="Unusable"
                stroke="#ef4444"
                strokeWidth={0}
                fillOpacity={0.85}
                fill="#ef4444"
                stackId="rating"
              />
              <Area
                type="monotone"
                dataKey="problematicPct"
                name="Problematic"
                stroke="#f97316"
                strokeWidth={0}
                fillOpacity={0.85}
                fill="#f97316"
                stackId="rating"
              />
              <Area
                type="monotone"
                dataKey="usablePct"
                name="Usable"
                stroke="#eab308"
                strokeWidth={0}
                fillOpacity={0.85}
                fill="#eab308"
                stackId="rating"
              />
              <Area
                type="monotone"
                dataKey="goodPct"
                name="Good"
                stroke="#22c55e"
                strokeWidth={0}
                fillOpacity={0.85}
                fill="#22c55e"
                stackId="rating"
              />
              <Area
                type="monotone"
                dataKey="perfectPct"
                name="Perfect"
                stroke="#0d9488"
                strokeWidth={0}
                fillOpacity={0.85}
                fill="#0d9488"
                stackId="rating"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
