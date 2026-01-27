'use client';

import { useState } from 'react';
import { Angry, Frown, Meh, Smile, Laugh, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, CheckCircle, CircleDot, XCircle, MessageSquare } from 'lucide-react';

type AnalyticsView = 'message' | 'conversation';

type FeedbackItem = {
  id: string;
  created_at: string;
  user_input: string;
  response_content: string;
  feedback_rating: 'unusable' | 'problematic' | 'usable' | 'good' | 'perfect';
  feedback_tags: string[] | null;
  feedback_comment: string | null;
  trace_data: unknown;
};

type ConversationItem = {
  id: string;
  title: string;
  category: string | null;
  sub_category: string | null;
  feedback_rating: 'solved' | 'partially_solved' | 'not_solved';
  feedback_comment: string | null;
  message_count: number;
  created_at: string;
};

type AnalyticsFeedbackListProps = {
  data: FeedbackItem[] | ConversationItem[];
  isLoading: boolean;
  error: string | null;
  page: number;
  limit: number;
  ratingFilter: string;
  onRatingFilterChange: (value: string) => void;
  onPageChange: (page: number) => void;
  view?: AnalyticsView;
};

const RATING_ICONS = {
  unusable: Angry,
  problematic: Frown,
  usable: Meh,
  good: Smile,
  perfect: Laugh
};

const RATING_LABELS = {
  unusable: 'Unusable',
  problematic: 'Problematic',
  usable: 'Usable',
  good: 'Good',
  perfect: 'Perfect'
};

const CONVERSATION_RATING_ICONS = {
  solved: CheckCircle,
  partially_solved: CircleDot,
  not_solved: XCircle
};

const CONVERSATION_RATING_LABELS = {
  solved: 'Solved',
  partially_solved: 'Partially Solved',
  not_solved: 'Not Solved'
};

function isFeedbackItem(item: FeedbackItem | ConversationItem): item is FeedbackItem {
  return 'user_input' in item;
}

export default function AnalyticsFeedbackList({
  data,
  isLoading,
  error,
  page,
  limit,
  ratingFilter,
  onRatingFilterChange,
  onPageChange,
  view = 'message'
}: AnalyticsFeedbackListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const title = view === 'conversation' ? 'Recent Conversations' : 'Recent Feedback';

  if (isLoading && data.length === 0) {
    return (
      <div className="george-analytics-feedback-list">
        <div className="george-analytics-section-header">
          <h2 className="george-analytics-section-title">{title}</h2>
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
          <h2 className="george-analytics-section-title">{title}</h2>
        </div>
        <div className="george-analytics-error">{error}</div>
      </div>
    );
  }

  // Conversation view
  if (view === 'conversation') {
    const conversations = data as ConversationItem[];

    return (
      <div className="george-analytics-feedback-list">
        <div className="george-analytics-section-header">
          <h2 className="george-analytics-section-title">{title}</h2>
          <div className="george-analytics-feedback-filters">
            <select
              className="george-analytics-feedback-filter"
              value={ratingFilter}
              onChange={(e) => onRatingFilterChange(e.target.value)}
            >
              <option value="">All ratings</option>
              <option value="solved">Solved</option>
              <option value="partially_solved">Partially Solved</option>
              <option value="not_solved">Not Solved</option>
            </select>
          </div>
        </div>

        {conversations.length === 0 ? (
          <div className="george-analytics-empty">No conversations with feedback for this period.</div>
        ) : (
          <>
            <div className="george-analytics-feedback-items">
              {conversations.map((item) => {
                const rating = item.feedback_rating as keyof typeof CONVERSATION_RATING_ICONS;
                const Icon = CONVERSATION_RATING_ICONS[rating] || CircleDot;
                const isExpanded = expandedId === item.id;
                const categoryDisplay = item.sub_category
                  ? `${item.category || 'Uncategorized'} / ${item.sub_category}`
                  : item.category || 'Uncategorized';

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
                          {truncateText(item.title || 'Untitled conversation', 100)}
                        </div>
                        <div className="george-analytics-feedback-meta">
                          <span className={`george-analytics-feedback-rating is-${item.feedback_rating}`}>
                            {CONVERSATION_RATING_LABELS[rating]}
                          </span>
                          <span className="george-analytics-feedback-category">
                            {categoryDisplay}
                          </span>
                          <span className="george-analytics-feedback-exchanges">
                            <MessageSquare size={12} />
                            {item.message_count} exchanges
                          </span>
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
                          <div className="george-analytics-feedback-label">Conversation Title</div>
                          <div className="george-analytics-feedback-text">{item.title || 'Untitled'}</div>
                        </div>

                        <div className="george-analytics-feedback-section">
                          <div className="george-analytics-feedback-label">Category</div>
                          <div className="george-analytics-feedback-text">{categoryDisplay}</div>
                        </div>

                        <div className="george-analytics-feedback-section">
                          <div className="george-analytics-feedback-label">Messages</div>
                          <div className="george-analytics-feedback-text">{item.message_count} exchanges</div>
                        </div>

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
                onClick={() => onPageChange(Math.max(1, page - 1))}
              >
                <ChevronLeft size={16} />
                Previous
              </button>
              <span className="george-analytics-pagination-info">Page {page}</span>
              <button
                type="button"
                className="george-analytics-pagination-btn"
                disabled={conversations.length < limit}
                onClick={() => onPageChange(page + 1)}
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

  // Message view (default)
  const feedbackItems = data as FeedbackItem[];

  return (
    <div className="george-analytics-feedback-list">
      <div className="george-analytics-section-header">
        <h2 className="george-analytics-section-title">{title}</h2>
        <div className="george-analytics-feedback-filters">
          <select
            className="george-analytics-feedback-filter"
            value={ratingFilter}
            onChange={(e) => onRatingFilterChange(e.target.value)}
          >
            <option value="">All ratings</option>
            <option value="perfect">Perfect</option>
            <option value="good">Good</option>
            <option value="usable">Usable</option>
            <option value="problematic">Problematic</option>
            <option value="unusable">Unusable</option>
          </select>
        </div>
      </div>

      {feedbackItems.length === 0 ? (
        <div className="george-analytics-empty">No feedback for this period.</div>
      ) : (
        <>
          <div className="george-analytics-feedback-items">
            {feedbackItems.map((item) => {
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
              onClick={() => onPageChange(Math.max(1, page - 1))}
            >
              <ChevronLeft size={16} />
              Previous
            </button>
            <span className="george-analytics-pagination-info">Page {page}</span>
            <button
              type="button"
              className="george-analytics-pagination-btn"
              disabled={feedbackItems.length < limit}
              onClick={() => onPageChange(page + 1)}
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
