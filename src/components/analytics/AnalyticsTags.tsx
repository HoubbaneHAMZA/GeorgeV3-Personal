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
          <span className="george-analytics-section-subtitle">Issues selected when rating is Usable/Problematic/Unusable</span>
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
          <span className="george-analytics-section-subtitle">Issues selected when rating is Usable/Problematic/Unusable</span>
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
          <span className="george-analytics-section-subtitle">Issues selected when rating is Usable/Problematic/Unusable</span>
        </div>
        <div className="george-analytics-empty">No feedback tags for this period.</div>
      </div>
    );
  }

  // Take top 5 tags
  const topTags = data.slice(0, 5);
  const maxCount = topTags[0]?.count || 1;
  const totalCount = data.reduce((sum, tag) => sum + tag.count, 0);

  return (
    <div className="george-analytics-tags">
      <div className="george-analytics-section-header">
        <h2 className="george-analytics-section-title">Top Feedback Tags</h2>
        <span className="george-analytics-section-subtitle">Issues selected when rating is Usable/Problematic/Unusable</span>
      </div>
      <div className="george-analytics-tags-list">
        {topTags.map((tag, index) => {
          const percentage = totalCount > 0 ? Math.round((tag.count / totalCount) * 100) : 0;
          const barWidth = (tag.count / maxCount) * 100;

          return (
            <div key={tag.tag} className="george-analytics-tag-row">
              <div className="george-analytics-tag-rank">{index + 1}</div>
              <div className="george-analytics-tag-name">{tag.tag}</div>
              <div className="george-analytics-tag-bar-container">
                <div
                  className="george-analytics-tag-bar-fill"
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <div className="george-analytics-tag-percent">{percentage}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
