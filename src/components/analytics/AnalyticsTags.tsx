'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell
} from 'recharts';

type TagData = {
  tag: string;
  count: number;
  unusable: number;
  problematic: number;
};

type AnalyticsTagsProps = {
  data: TagData[];
  isLoading: boolean;
  error: string | null;
};

export default function AnalyticsTags({ data, isLoading, error }: AnalyticsTagsProps) {
  if (isLoading) {
    return (
      <div className="george-analytics-tags">
        <div className="george-analytics-section-header">
          <h2 className="george-analytics-section-title">Top Feedback Tags</h2>
        </div>
        <div className="george-analytics-chart-loading">
          <div className="george-analytics-chart-skeleton" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="george-analytics-tags">
        <div className="george-analytics-section-header">
          <h2 className="george-analytics-section-title">Top Feedback Tags</h2>
        </div>
        <div className="george-analytics-error">{error}</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="george-analytics-tags">
        <div className="george-analytics-section-header">
          <h2 className="george-analytics-section-title">Top Feedback Tags</h2>
        </div>
        <div className="george-analytics-empty">No feedback tags for this period.</div>
      </div>
    );
  }

  // Transform data for stacked bar chart
  const chartData = data.slice(0, 8).map(tag => ({
    name: tag.tag.length > 18 ? tag.tag.slice(0, 18) + '...' : tag.tag,
    fullName: tag.tag,
    unusable: tag.unusable,
    problematic: tag.problematic,
    other: Math.max(0, tag.count - tag.unusable - tag.problematic),
    total: tag.count
  }));

  return (
    <div className="george-analytics-tags">
      <div className="george-analytics-section-header">
        <h2 className="george-analytics-section-title">Top Feedback Tags</h2>
      </div>
      <div className="george-analytics-chart">
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 80 }} barSize={40}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fill: 'var(--muted)' }}
              angle={-35}
              textAnchor="end"
              interval={0}
              height={70}
              stroke="var(--border)"
              dy={5}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--muted)' }}
              stroke="var(--border)"
              allowDecimals={false}
              width={30}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--page-bg)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                fontSize: '12px'
              }}
              formatter={(value, name) => {
                const labels: Record<string, string> = {
                  other: 'Other',
                  problematic: 'Problematic',
                  unusable: 'Unusable'
                };
                const nameStr = String(name ?? '');
                return [value ?? 0, labels[nameStr] || nameStr];
              }}
              labelFormatter={(label, payload) => {
                if (payload && payload.length > 0) {
                  const item = payload[0].payload;
                  return `${item.fullName} (Total: ${item.total})`;
                }
                return label;
              }}
            />
            <Legend
              verticalAlign="top"
              height={36}
              wrapperStyle={{ fontSize: '11px' }}
              formatter={(value: string) => {
                const labels: Record<string, string> = {
                  other: 'Other',
                  problematic: 'Problematic',
                  unusable: 'Unusable'
                };
                return labels[value] || value;
              }}
            />
            <Bar dataKey="other" stackId="a" fill="#22c55e" name="other" radius={[0, 0, 0, 0]} />
            <Bar dataKey="problematic" stackId="a" fill="#f97316" name="problematic" radius={[0, 0, 0, 0]} />
            <Bar dataKey="unusable" stackId="a" fill="#ef4444" name="unusable" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
