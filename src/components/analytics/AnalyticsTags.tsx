'use client';

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
          const unusablePercent = tag.count > 0 ? (tag.unusable / tag.count) * 100 : 0;
          const problematicPercent = tag.count > 0 ? (tag.problematic / tag.count) * 100 : 0;
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
                      className="george-analytics-tag-bar-unusable"
                      style={{ width: `${unusablePercent}%` }}
                      title={`Unusable: ${tag.unusable}`}
                    />
                    <div
                      className="george-analytics-tag-bar-problematic"
                      style={{ width: `${problematicPercent}%` }}
                      title={`Problematic: ${tag.problematic}`}
                    />
                  </div>
                </div>
                <div className="george-analytics-tag-breakdown">
                  <span className="george-analytics-tag-unusable">{tag.unusable} unusable</span>
                  <span className="george-analytics-tag-problematic">{tag.problematic} problematic</span>
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
