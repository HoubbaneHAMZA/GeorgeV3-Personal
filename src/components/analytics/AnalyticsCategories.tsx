'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';

type CategoryData = {
  category: string;
  count: number;
  solved: number;
  partially_solved: number;
  not_solved: number;
};

type AnalyticsCategoriesProps = {
  data: CategoryData[];
  isLoading: boolean;
  error: string | null;
};

export default function AnalyticsCategories({ data, isLoading, error }: AnalyticsCategoriesProps) {
  if (isLoading) {
    return (
      <div className="george-analytics-categories">
        <div className="george-analytics-section-header">
          <h2 className="george-analytics-section-title">Feedback by Category</h2>
        </div>
        <div className="george-analytics-chart-loading">
          <div className="george-analytics-chart-skeleton" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="george-analytics-categories">
        <div className="george-analytics-section-header">
          <h2 className="george-analytics-section-title">Feedback by Category</h2>
        </div>
        <div className="george-analytics-error">{error}</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="george-analytics-categories">
        <div className="george-analytics-section-header">
          <h2 className="george-analytics-section-title">Feedback by Category</h2>
        </div>
        <div className="george-analytics-empty">No category data for this period.</div>
      </div>
    );
  }

  // Normalize category string for comparison (handle whitespace, case differences)
  const normalizeCategory = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

  // Aggregate data by normalized category name (in case same category appears multiple times)
  const aggregatedData = data.reduce((acc, cat) => {
    const normalizedKey = normalizeCategory(cat.category);
    const existing = acc.find(item => normalizeCategory(item.category) === normalizedKey);
    if (existing) {
      existing.count += cat.count;
      existing.solved += cat.solved;
      existing.partially_solved += cat.partially_solved;
      existing.not_solved += cat.not_solved;
    } else {
      acc.push({ ...cat });
    }
    return acc;
  }, [] as CategoryData[]);

  // Sort by total count descending and take top 8
  const sortedData = aggregatedData
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Transform data for stacked bar chart
  // Smart truncation: if category has "Parent / Sub", show "Sub" part preferentially
  const getDisplayName = (category: string, maxLen = 20): string => {
    if (category.length <= maxLen) return category;

    // If it has a " / " separator, try to show the sub-category
    if (category.includes(' / ')) {
      const parts = category.split(' / ');
      const subCategory = parts[parts.length - 1];
      if (subCategory.length <= maxLen) return subCategory;
      return subCategory.slice(0, maxLen - 3) + '...';
    }

    return category.slice(0, maxLen - 3) + '...';
  };

  const chartData = sortedData.map(cat => ({
    name: getDisplayName(cat.category),
    fullName: cat.category,
    solved: cat.solved,
    partially_solved: cat.partially_solved,
    not_solved: cat.not_solved,
    total: cat.count
  }));

  return (
    <div className="george-analytics-categories">
      <div className="george-analytics-section-header">
        <h2 className="george-analytics-section-title">Feedback by Category</h2>
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
                  solved: 'Solved',
                  partially_solved: 'Partially Solved',
                  not_solved: 'Not Solved'
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
                  solved: 'Solved',
                  partially_solved: 'Partially Solved',
                  not_solved: 'Not Solved'
                };
                return labels[value] || value;
              }}
            />
            <Bar dataKey="solved" stackId="a" fill="#22c55e" name="solved" radius={[0, 0, 0, 0]} />
            <Bar dataKey="partially_solved" stackId="a" fill="#eab308" name="partially_solved" radius={[0, 0, 0, 0]} />
            <Bar dataKey="not_solved" stackId="a" fill="#ef4444" name="not_solved" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
