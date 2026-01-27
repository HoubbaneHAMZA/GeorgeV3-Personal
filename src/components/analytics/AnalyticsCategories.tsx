'use client';

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
        <div className="george-analytics-categories-loading">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="george-analytics-category-skeleton" />
          ))}
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

  const maxCount = Math.max(...data.map((c) => c.count));

  return (
    <div className="george-analytics-categories">
      <div className="george-analytics-section-header">
        <h2 className="george-analytics-section-title">Feedback by Category</h2>
      </div>
      <div className="george-analytics-categories-list">
        {data.slice(0, 8).map((category, index) => {
          const solvedPercent = category.count > 0 ? (category.solved / category.count) * 100 : 0;
          const partialPercent = category.count > 0 ? (category.partially_solved / category.count) * 100 : 0;
          const notSolvedPercent = category.count > 0 ? (category.not_solved / category.count) * 100 : 0;
          const barWidth = (category.count / maxCount) * 100;

          return (
            <div key={category.category} className="george-analytics-category-item">
              <div className="george-analytics-category-rank">{index + 1}</div>
              <div className="george-analytics-category-content">
                <div className="george-analytics-category-name">{category.category}</div>
                <div className="george-analytics-category-bar-wrapper">
                  <div
                    className="george-analytics-category-bar-stacked"
                    style={{ width: `${barWidth}%` }}
                  >
                    <div
                      className="george-analytics-category-bar-solved"
                      style={{ width: `${solvedPercent}%` }}
                      title={`Solved: ${category.solved}`}
                    />
                    <div
                      className="george-analytics-category-bar-partial"
                      style={{ width: `${partialPercent}%` }}
                      title={`Partially Solved: ${category.partially_solved}`}
                    />
                    <div
                      className="george-analytics-category-bar-not-solved"
                      style={{ width: `${notSolvedPercent}%` }}
                      title={`Not Solved: ${category.not_solved}`}
                    />
                  </div>
                </div>
                <div className="george-analytics-category-breakdown">
                  <span className="george-analytics-category-solved">{category.solved} solved</span>
                  <span className="george-analytics-category-partial">{category.partially_solved} partial</span>
                  <span className="george-analytics-category-not-solved">{category.not_solved} not solved</span>
                </div>
              </div>
              <div className="george-analytics-category-count">{category.count}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
