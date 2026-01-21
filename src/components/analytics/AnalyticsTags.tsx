'use client';

import { useEffect, useState } from 'react';

type TagData = {
  tag: string;
  count: number;
  bad: number;
  okay: number;
};

type AnalyticsTagsProps = {
  accessToken: string;
  from: string;
  to: string;
};

export default function AnalyticsTags({ accessToken, from, to }: AnalyticsTagsProps) {
  const [data, setData] = useState<TagData[]>([]);
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
        const response = await fetch(`/api/feedback-analytics/stats/tags?${params}`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch tags data');
        }

        const result = await response.json();
        setData(result.tags || []);
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
      <div className="george-analytics-tags">
        <div className="george-analytics-section-header">
          <h2 className="george-analytics-section-title">Top Feedback Tags</h2>
        </div>
        <div className="george-analytics-tags-loading">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="george-analytics-tag-skeleton" />
          ))}
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

  const maxCount = Math.max(...data.map((t) => t.count));

  return (
    <div className="george-analytics-tags">
      <div className="george-analytics-section-header">
        <h2 className="george-analytics-section-title">Top Feedback Tags</h2>
      </div>
      <div className="george-analytics-tags-list">
        {data.slice(0, 8).map((tag, index) => {
          const badPercent = tag.count > 0 ? (tag.bad / tag.count) * 100 : 0;
          const okayPercent = tag.count > 0 ? (tag.okay / tag.count) * 100 : 0;
          const barWidth = (tag.count / maxCount) * 100;

          return (
            <div key={tag.tag} className="george-analytics-tag-item">
              <div className="george-analytics-tag-rank">{index + 1}</div>
              <div className="george-analytics-tag-content">
                <div className="george-analytics-tag-name">{tag.tag}</div>
                <div className="george-analytics-tag-bar-wrapper">
                  <div
                    className="george-analytics-tag-bar-stacked"
                    style={{ width: `${barWidth}%` }}
                  >
                    <div
                      className="george-analytics-tag-bar-bad"
                      style={{ width: `${badPercent}%` }}
                      title={`Bad: ${tag.bad}`}
                    />
                    <div
                      className="george-analytics-tag-bar-okay"
                      style={{ width: `${okayPercent}%` }}
                      title={`Okay: ${tag.okay}`}
                    />
                  </div>
                </div>
                <div className="george-analytics-tag-breakdown">
                  <span className="george-analytics-tag-bad">{tag.bad} bad</span>
                  <span className="george-analytics-tag-okay">{tag.okay} okay</span>
                </div>
              </div>
              <div className="george-analytics-tag-count">{tag.count}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
