'use client';

import { useEffect, useState, useCallback } from 'react';
import { Frown, Meh, Smile, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';

type FeedbackItem = {
  id: string;
  created_at: string;
  user_input: string;
  response_content: string;
  feedback_rating: 'bad' | 'okay' | 'good';
  feedback_tags: string[] | null;
  feedback_comment: string | null;
  trace_data: unknown;
};

type AnalyticsFeedbackListProps = {
  accessToken: string;
  from: string;
  to: string;
};

const RATING_ICONS = {
  bad: Frown,
  okay: Meh,
  good: Smile
};

const RATING_LABELS = {
  bad: 'Bad',
  okay: 'Okay',
  good: 'Good'
};

export default function AnalyticsFeedbackList({ accessToken, from, to }: AnalyticsFeedbackListProps) {
  const [data, setData] = useState<FeedbackItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [ratingFilter, setRatingFilter] = useState<string>('');
  const limit = 10;

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (ratingFilter) params.set('rating', ratingFilter);
    params.set('page', String(page));
    params.set('limit', String(limit));

    try {
      const response = await fetch(`/api/feedback-analytics/feedback-list?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch feedback list');
      }

      const result = await response.json();
      setData(result.interactions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, from, to, page, ratingFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setPage(1);
  }, [from, to, ratingFilter]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  };

  if (isLoading && data.length === 0) {
    return (
      <div className="george-analytics-feedback-list">
        <div className="george-analytics-section-header">
          <h2 className="george-analytics-section-title">Recent Feedback</h2>
        </div>
        <div className="george-analytics-feedback-loading">
          {[1, 2, 3].map((i) => (
            <div key={i} className="george-analytics-feedback-skeleton" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="george-analytics-feedback-list">
        <div className="george-analytics-section-header">
          <h2 className="george-analytics-section-title">Recent Feedback</h2>
        </div>
        <div className="george-analytics-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="george-analytics-feedback-list">
      <div className="george-analytics-section-header">
        <h2 className="george-analytics-section-title">Recent Feedback</h2>
        <div className="george-analytics-feedback-filters">
          <select
            className="george-analytics-feedback-filter"
            value={ratingFilter}
            onChange={(e) => setRatingFilter(e.target.value)}
          >
            <option value="">All ratings</option>
            <option value="good">Good</option>
            <option value="okay">Okay</option>
            <option value="bad">Bad</option>
          </select>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="george-analytics-empty">No feedback for this period.</div>
      ) : (
        <>
          <div className="george-analytics-feedback-items">
            {data.map((item) => {
              const Icon = RATING_ICONS[item.feedback_rating] || Meh;
              const isExpanded = expandedId === item.id;

              return (
                <div
                  key={item.id}
                  className={`george-analytics-feedback-item${isExpanded ? ' is-expanded' : ''}`}
                >
                  <button
                    type="button"
                    className="george-analytics-feedback-header"
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  >
                    <div className={`george-analytics-feedback-icon is-${item.feedback_rating}`}>
                      <Icon size={18} />
                    </div>
                    <div className="george-analytics-feedback-main">
                      <div className="george-analytics-feedback-question">
                        {truncateText(item.user_input, 100)}
                      </div>
                      <div className="george-analytics-feedback-meta">
                        <span className={`george-analytics-feedback-rating is-${item.feedback_rating}`}>
                          {RATING_LABELS[item.feedback_rating]}
                        </span>
                        {item.feedback_tags && item.feedback_tags.length > 0 && (
                          <span className="george-analytics-feedback-tag-count">
                            {item.feedback_tags.length} tag{item.feedback_tags.length !== 1 ? 's' : ''}
                          </span>
                        )}
                        <span className="george-analytics-feedback-date">
                          {formatDate(item.created_at)}
                        </span>
                      </div>
                    </div>
                    <div className="george-analytics-feedback-chevron">
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="george-analytics-feedback-body">
                      <div className="george-analytics-feedback-section">
                        <div className="george-analytics-feedback-label">User Question</div>
                        <div className="george-analytics-feedback-text">{item.user_input}</div>
                      </div>

                      <div className="george-analytics-feedback-section">
                        <div className="george-analytics-feedback-label">George&apos;s Response</div>
                        <div className="george-analytics-feedback-text george-analytics-feedback-response">
                          {truncateText(item.response_content, 500)}
                        </div>
                      </div>

                      {item.feedback_tags && item.feedback_tags.length > 0 && (
                        <div className="george-analytics-feedback-section">
                          <div className="george-analytics-feedback-label">Feedback Tags</div>
                          <div className="george-analytics-feedback-tags">
                            {item.feedback_tags.map((tag) => (
                              <span key={tag} className="george-analytics-feedback-tag">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {item.feedback_comment && (
                        <div className="george-analytics-feedback-section">
                          <div className="george-analytics-feedback-label">Comment</div>
                          <div className="george-analytics-feedback-text">
                            {item.feedback_comment}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="george-analytics-pagination">
            <button
              type="button"
              className="george-analytics-pagination-btn"
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={16} />
              Previous
            </button>
            <span className="george-analytics-pagination-info">Page {page}</span>
            <button
              type="button"
              className="george-analytics-pagination-btn"
              disabled={data.length < limit}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
