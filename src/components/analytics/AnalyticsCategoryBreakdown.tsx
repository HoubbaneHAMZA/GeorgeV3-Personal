'use client';

import { useState, useMemo } from 'react';
import { Cog, ShoppingCart, HelpCircle, Settings, Layers } from 'lucide-react';

// Message category data type (from message view)
type MessageCategoryData = {
  category: string;
  count: number;
  perfect: number;
  good: number;
  usable: number;
  problematic: number;
  unusable: number;
};

// Conversation category data type (from conversation view)
type ConversationCategoryData = {
  category: string;
  count: number;
  solved: number;
  partially_solved: number;
  not_solved: number;
};

type CategoryData = MessageCategoryData | ConversationCategoryData;

type AnalyticsCategoryBreakdownProps = {
  data: CategoryData[];
  isLoading: boolean;
  error: string | null;
  view: 'message' | 'conversation';
};

type SortMode = 'volume' | 'rating';

// Check if data is message category
function isMessageCategory(data: CategoryData): data is MessageCategoryData {
  return 'perfect' in data;
}

// Calculate satisfaction score based on view type
function calculateSatisfactionScore(data: CategoryData): number {
  if (data.count === 0) return 0;

  if (isMessageCategory(data)) {
    // Message view: (perfect + good) / total
    return ((data.perfect + data.good) / data.count) * 100;
  } else {
    // Conversation view: (solved + partially_solved) / total
    return ((data.solved + data.partially_solved) / data.count) * 100;
  }
}

// Get color class for satisfaction score
function getScoreClass(score: number): 'high' | 'medium' | 'low' {
  if (score >= 75) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

// Parse category string into parent category and subcategory
function parseCategory(categoryString: string): { parent: string; sub: string | null } {
  if (categoryString.includes(' / ')) {
    const [parent, ...rest] = categoryString.split(' / ');
    return { parent: parent.trim(), sub: rest.join(' / ').trim() };
  }
  return { parent: categoryString, sub: null };
}

// Get icon for category
function getCategoryIcon(categoryName: string) {
  const name = categoryName.toLowerCase();
  if (name.includes('software') || name.includes('technical')) {
    return <Cog size={16} />;
  }
  if (name.includes('purchase') || name.includes('order') || name.includes('payment')) {
    return <ShoppingCart size={16} />;
  }
  if (name.includes('account') || name.includes('settings')) {
    return <Settings size={16} />;
  }
  if (name.includes('general') || name.includes('other')) {
    return <Layers size={16} />;
  }
  return <HelpCircle size={16} />;
}

// Get icon background color
function getCategoryIconStyle(categoryName: string): { background: string; color: string } {
  const name = categoryName.toLowerCase();
  if (name.includes('software') || name.includes('technical')) {
    return { background: 'var(--indigo-light, #e0e7ff)', color: 'var(--indigo, #6366f1)' };
  }
  if (name.includes('purchase') || name.includes('order') || name.includes('payment')) {
    return { background: 'var(--green-light, #d1fae5)', color: 'var(--green, #10b981)' };
  }
  if (name.includes('account') || name.includes('settings')) {
    return { background: 'var(--purple-light, #ede9fe)', color: 'var(--purple, #8b5cf6)' };
  }
  return { background: 'var(--gray-100, #f3f4f6)', color: 'var(--gray-500, #6b7280)' };
}

type CategoryGroup = {
  name: string;
  percentage: number;
  totalCount: number;
  avgSatisfactionScore?: number;
  subcategories: {
    name: string;
    percentage: number;
    count: number;
    satisfactionScore: number;
    data: CategoryData;
  }[];
};

export default function AnalyticsCategoryBreakdown({
  data,
  isLoading,
  error,
  view
}: AnalyticsCategoryBreakdownProps) {
  const [sortMode, setSortMode] = useState<SortMode>('volume');

  // Transform flat data into hierarchical structure
  const categoryGroups = useMemo(() => {
    if (!data || data.length === 0) return [];

    const totalCount = data.reduce((sum, d) => sum + d.count, 0);
    const groupMap = new Map<string, CategoryGroup>();

    // First pass: group by parent category
    for (const item of data) {
      const { parent, sub } = parseCategory(item.category);
      const satisfactionScore = calculateSatisfactionScore(item);

      if (!groupMap.has(parent)) {
        groupMap.set(parent, {
          name: parent,
          percentage: 0,
          totalCount: 0,
          subcategories: []
        });
      }

      const group = groupMap.get(parent)!;
      group.totalCount += item.count;

      if (sub) {
        group.subcategories.push({
          name: sub,
          percentage: totalCount > 0 ? (item.count / totalCount) * 100 : 0,
          count: item.count,
          satisfactionScore,
          data: item
        });
      } else {
        // No subcategory - treat as a single item in the group
        group.subcategories.push({
          name: parent,
          percentage: totalCount > 0 ? (item.count / totalCount) * 100 : 0,
          count: item.count,
          satisfactionScore,
          data: item
        });
      }
    }

    // Second pass: calculate group percentages and average satisfaction
    const groups = Array.from(groupMap.values()).map(group => {
      // Calculate weighted average satisfaction score for the group
      const totalSubs = group.subcategories.reduce((sum, sub) => sum + sub.count, 0);
      const avgSatisfaction = totalSubs > 0
        ? group.subcategories.reduce((sum, sub) => sum + sub.satisfactionScore * sub.count, 0) / totalSubs
        : 0;

      return {
        ...group,
        percentage: totalCount > 0 ? (group.totalCount / totalCount) * 100 : 0,
        avgSatisfactionScore: avgSatisfaction
      };
    });

    // Sort groups based on sort mode
    if (sortMode === 'volume') {
      groups.sort((a, b) => b.totalCount - a.totalCount);
    } else {
      // Sort by average satisfaction score, then by volume as tiebreaker
      groups.sort((a, b) => {
        const scoreDiff = b.avgSatisfactionScore - a.avgSatisfactionScore;
        if (Math.abs(scoreDiff) < 0.01) return b.totalCount - a.totalCount;
        return scoreDiff;
      });
    }

    // Sort subcategories within each group based on sort mode
    for (const group of groups) {
      if (sortMode === 'volume') {
        group.subcategories.sort((a, b) => b.count - a.count);
      } else {
        group.subcategories.sort((a, b) => b.satisfactionScore - a.satisfactionScore);
      }
    }

    return groups;
  }, [data, sortMode]);

  if (isLoading) {
    return (
      <div className="george-analytics-category-breakdown">
        <div className="george-analytics-section-header">
          <h2 className="george-analytics-section-title">Rating by Ticket Category</h2>
          <span className="george-analytics-section-subtitle">
            {view === 'message' ? 'Message quality distribution per category' : 'Conversation resolution per category'}
          </span>
        </div>
        <div className="george-analytics-chart-loading">
          <div className="george-analytics-chart-skeleton" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="george-analytics-category-breakdown">
        <div className="george-analytics-section-header">
          <h2 className="george-analytics-section-title">Rating by Ticket Category</h2>
          <span className="george-analytics-section-subtitle">
            {view === 'message' ? 'Message quality distribution per category' : 'Conversation resolution per category'}
          </span>
        </div>
        <div className="george-analytics-error">{error}</div>
      </div>
    );
  }

  if (categoryGroups.length === 0) {
    return (
      <div className="george-analytics-category-breakdown">
        <div className="george-analytics-section-header">
          <h2 className="george-analytics-section-title">Rating by Ticket Category</h2>
          <span className="george-analytics-section-subtitle">
            {view === 'message' ? 'Message quality distribution per category' : 'Conversation resolution per category'}
          </span>
        </div>
        <div className="george-analytics-empty">No category data for this period.</div>
      </div>
    );
  }

  return (
    <div className="george-analytics-category-breakdown">
      <div className="george-analytics-section-header">
        <h2 className="george-analytics-section-title">Rating by Ticket Category</h2>
        <span className="george-analytics-section-subtitle">
          {view === 'message' ? 'Message quality distribution per category' : 'Conversation resolution per category'}
        </span>
      </div>

      {/* Controls */}
      <div className="george-analytics-category-controls">
        <div className="george-analytics-category-legend">
          <span className="george-analytics-legend-label">Satisfaction Score</span>
          <span className="george-analytics-legend-desc">
            = {view === 'message' ? 'Perfect + Good' : 'Solved + Partially Solved'} ratings
          </span>
          <span className="george-analytics-legend-item">
            <span className="george-analytics-legend-dot george-analytics-legend-dot-high" />
            High (≥75%)
          </span>
          <span className="george-analytics-legend-item">
            <span className="george-analytics-legend-dot george-analytics-legend-dot-medium" />
            Medium (50-74%)
          </span>
          <span className="george-analytics-legend-item">
            <span className="george-analytics-legend-dot george-analytics-legend-dot-low" />
            Low (&lt;50%)
          </span>
        </div>
        <div className="george-analytics-sort-toggle">
          <span className="george-analytics-sort-label">Sort by:</span>
          <div className="george-analytics-sort-buttons">
            <button
              type="button"
              className={`george-analytics-sort-btn${sortMode === 'rating' ? ' is-active' : ''}`}
              onClick={() => setSortMode('rating')}
            >
              Rating
            </button>
            <button
              type="button"
              className={`george-analytics-sort-btn${sortMode === 'volume' ? ' is-active' : ''}`}
              onClick={() => setSortMode('volume')}
            >
              Volume
            </button>
          </div>
        </div>
      </div>

      {/* Category Groups */}
      <div className="george-analytics-category-groups">
        {categoryGroups.map(group => {
          const iconStyle = getCategoryIconStyle(group.name);
          // Check if this category has only one subcategory with the same name (no real subcategory)
          const isSingleWithSameName = group.subcategories.length === 1 && group.subcategories[0].name === group.name;
          const singleSubScore = isSingleWithSameName ? group.subcategories[0].satisfactionScore : null;
          const singleSubScoreClass = singleSubScore !== null ? getScoreClass(singleSubScore) : null;

          return (
            <div key={group.name} className={`george-analytics-category-group${isSingleWithSameName ? ' is-standalone' : ''}`}>
              <div className={`george-analytics-category-group-header${isSingleWithSameName ? ' is-standalone' : ''}`}>
                <div
                  className="george-analytics-category-group-icon"
                  style={{ background: iconStyle.background, color: iconStyle.color }}
                >
                  {getCategoryIcon(group.name)}
                </div>
                <div className="george-analytics-category-group-title">{group.name}</div>
                <div className="george-analytics-category-group-total">
                  {group.percentage.toFixed(1)}% of rated {view === 'message' ? 'messages' : 'conversations'}
                </div>
                {/* Show satisfaction score in header if only one subcategory with same name */}
                {isSingleWithSameName && singleSubScore !== null && singleSubScoreClass && (
                  <div className="george-analytics-score-gauge george-analytics-score-gauge-inline">
                    <div className="george-analytics-gauge-track">
                      <div
                        className={`george-analytics-gauge-fill george-analytics-gauge-fill-${singleSubScoreClass}`}
                        style={{ width: `${Math.min(singleSubScore, 100)}%` }}
                      />
                    </div>
                    <span className={`george-analytics-score-value george-analytics-score-value-${singleSubScoreClass}`}>
                      {Math.round(singleSubScore)}%
                    </span>
                  </div>
                )}
              </div>
              {/* Only show subcategory list if there are multiple subcategories or the single one has a different name */}
              {!isSingleWithSameName && (
                <div className="george-analytics-subcategory-list">
                  {group.subcategories.map(sub => {
                    const scoreClass = getScoreClass(sub.satisfactionScore);

                    return (
                      <div key={sub.name} className="george-analytics-subcategory-row">
                        <div className="george-analytics-subcategory-info">
                          <span className="george-analytics-subcategory-name">{sub.name}</span>
                          <span className="george-analytics-subcategory-volume">
                            {sub.percentage.toFixed(2)}% of rated {view === 'message' ? 'messages' : 'conversations'}
                          </span>
                        </div>
                        <div className="george-analytics-score-gauge">
                          <div className="george-analytics-gauge-track">
                            <div
                              className={`george-analytics-gauge-fill george-analytics-gauge-fill-${scoreClass}`}
                              style={{ width: `${Math.min(sub.satisfactionScore, 100)}%` }}
                            />
                          </div>
                          <span className={`george-analytics-score-value george-analytics-score-value-${scoreClass}`}>
                            {Math.round(sub.satisfactionScore)}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
