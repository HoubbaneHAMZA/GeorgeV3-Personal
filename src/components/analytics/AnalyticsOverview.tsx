'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, MessageSquare, ThumbsUp, Clock } from 'lucide-react';

type OverviewData = {
  total_runs: number;
  feedback_count: number;
  feedback_rate: number;
  good_rate: number;
  okay_rate: number;
  bad_rate: number;
  avg_cost: number;
  avg_response_time: number;
};

type AnalyticsOverviewProps = {
  accessToken: string;
  from: string;
  to: string;
};

export default function AnalyticsOverview({ accessToken, from, to }: AnalyticsOverviewProps) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);

      try {
        const response = await fetch(`/api/feedback-analytics/stats/overview?${params}`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch overview data');
        }

        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [accessToken, from, to]);

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
    ? data.good_rate
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
      subtext: 'rated good'
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
              <span className="george-analytics-breakdown-dot is-okay" />
              Okay
            </div>
            <div className="george-analytics-breakdown-bar">
              <div
                className="george-analytics-breakdown-fill is-okay"
                style={{ width: `${data.okay_rate}%` }}
              />
            </div>
            <div className="george-analytics-breakdown-value">{data.okay_rate.toFixed(1)}%</div>
          </div>
          <div className="george-analytics-breakdown-item">
            <div className="george-analytics-breakdown-label">
              <span className="george-analytics-breakdown-dot is-bad" />
              Bad
            </div>
            <div className="george-analytics-breakdown-bar">
              <div
                className="george-analytics-breakdown-fill is-bad"
                style={{ width: `${data.bad_rate}%` }}
              />
            </div>
            <div className="george-analytics-breakdown-value">{data.bad_rate.toFixed(1)}%</div>
          </div>
        </div>
      </div>
    </div>
  );
}
