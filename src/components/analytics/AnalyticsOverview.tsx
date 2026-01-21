'use client';

import { TrendingUp, MessageSquare, ThumbsUp, Clock } from 'lucide-react';

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

type AnalyticsOverviewProps = {
  data: OverviewData | null;
  isLoading: boolean;
  error: string | null;
};

export default function AnalyticsOverview({ data, isLoading, error }: AnalyticsOverviewProps) {

  if (isLoading) {
    return (
      <div className="george-analytics-overview">
        <div className="george-analytics-cards">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="george-analytics-card is-loading">
              <div className="george-analytics-card-skeleton" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="george-analytics-overview">
        <div className="george-analytics-error">{error}</div>
      </div>
    );
  }

  if (!data) return null;

  const satisfactionRate = data.feedback_count > 0
    ? data.good_rate + data.perfect_rate
    : 0;

  const cards = [
    {
      icon: TrendingUp,
      label: 'Total Runs',
      value: data.total_runs.toLocaleString(),
      subtext: 'interactions'
    },
    {
      icon: MessageSquare,
      label: 'Feedback Rate',
      value: `${data.feedback_rate.toFixed(1)}%`,
      subtext: `${data.feedback_count} ratings`
    },
    {
      icon: ThumbsUp,
      label: 'Satisfaction',
      value: `${satisfactionRate.toFixed(1)}%`,
      subtext: 'good + perfect'
    },
    {
      icon: Clock,
      label: 'Avg Response Time',
      value: data.avg_response_time > 1000
        ? `${(data.avg_response_time / 1000).toFixed(1)}s`
        : `${Math.round(data.avg_response_time)}ms`,
      subtext: 'server time'
    }
  ];

  return (
    <div className="george-analytics-overview">
      <div className="george-analytics-cards">
        {cards.map((card) => (
          <div key={card.label} className="george-analytics-card">
            <div className="george-analytics-card-icon">
              <card.icon size={20} />
            </div>
            <div className="george-analytics-card-content">
              <div className="george-analytics-card-label">{card.label}</div>
              <div className="george-analytics-card-value">{card.value}</div>
              <div className="george-analytics-card-subtext">{card.subtext}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Rating Breakdown */}
      <div className="george-analytics-breakdown">
        <div className="george-analytics-breakdown-title">Rating Breakdown</div>
        <div className="george-analytics-breakdown-bars">
          <div className="george-analytics-breakdown-item">
            <div className="george-analytics-breakdown-label">
              <span className="george-analytics-breakdown-dot is-perfect" />
              Perfect
            </div>
            <div className="george-analytics-breakdown-bar">
              <div
                className="george-analytics-breakdown-fill is-perfect"
                style={{ width: `${data.perfect_rate}%` }}
              />
            </div>
            <div className="george-analytics-breakdown-value">{data.perfect_rate.toFixed(1)}%</div>
          </div>
          <div className="george-analytics-breakdown-item">
            <div className="george-analytics-breakdown-label">
              <span className="george-analytics-breakdown-dot is-good" />
              Good
            </div>
            <div className="george-analytics-breakdown-bar">
              <div
                className="george-analytics-breakdown-fill is-good"
                style={{ width: `${data.good_rate}%` }}
              />
            </div>
            <div className="george-analytics-breakdown-value">{data.good_rate.toFixed(1)}%</div>
          </div>
          <div className="george-analytics-breakdown-item">
            <div className="george-analytics-breakdown-label">
              <span className="george-analytics-breakdown-dot is-usable" />
              Usable
            </div>
            <div className="george-analytics-breakdown-bar">
              <div
                className="george-analytics-breakdown-fill is-usable"
                style={{ width: `${data.usable_rate}%` }}
              />
            </div>
            <div className="george-analytics-breakdown-value">{data.usable_rate.toFixed(1)}%</div>
          </div>
          <div className="george-analytics-breakdown-item">
            <div className="george-analytics-breakdown-label">
              <span className="george-analytics-breakdown-dot is-problematic" />
              Problematic
            </div>
            <div className="george-analytics-breakdown-bar">
              <div
                className="george-analytics-breakdown-fill is-problematic"
                style={{ width: `${data.problematic_rate}%` }}
              />
            </div>
            <div className="george-analytics-breakdown-value">{data.problematic_rate.toFixed(1)}%</div>
          </div>
          <div className="george-analytics-breakdown-item">
            <div className="george-analytics-breakdown-label">
              <span className="george-analytics-breakdown-dot is-unusable" />
              Unusable
            </div>
            <div className="george-analytics-breakdown-bar">
              <div
                className="george-analytics-breakdown-fill is-unusable"
                style={{ width: `${data.unusable_rate}%` }}
              />
            </div>
            <div className="george-analytics-breakdown-value">{data.unusable_rate.toFixed(1)}%</div>
          </div>
        </div>
      </div>
    </div>
  );
}
