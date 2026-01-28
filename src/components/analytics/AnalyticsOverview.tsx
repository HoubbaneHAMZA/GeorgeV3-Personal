'use client';

import { TrendingUp, MessageSquare, ThumbsUp, Clock, DollarSign, MessagesSquare } from 'lucide-react';

type AnalyticsView = 'message' | 'conversation';

type MessageOverviewData = {
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

type ConversationOverviewData = {
  total_conversations: number;
  feedback_count: number;
  feedback_rate: number;
  solved_rate: number;
  partially_solved_rate: number;
  not_solved_rate: number;
  avg_cost: number;
  avg_exchanges: number;
};

type OverviewData = MessageOverviewData | ConversationOverviewData;

type AnalyticsOverviewProps = {
  data: OverviewData | null;
  isLoading: boolean;
  error: string | null;
  view?: AnalyticsView;
};

function isConversationData(data: OverviewData): data is ConversationOverviewData {
  return 'total_conversations' in data;
}

export default function AnalyticsOverview({ data, isLoading, error, view = 'message' }: AnalyticsOverviewProps) {

  if (isLoading) {
    return (
      <div className="george-analytics-overview">
        <div className="george-analytics-cards">
          {[1, 2, 3, 4, 5].map((i) => (
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

  // Conversation view
  if (view === 'conversation') {
    // Cast to conversation data - the view prop determines which data structure we expect
    const convData = data as ConversationOverviewData;

    // Defensive: if the data doesn't have conversation fields, show nothing
    if (convData.total_conversations === undefined) {
      return null;
    }

    const satisfactionRate = convData.feedback_count > 0
      ? (convData.solved_rate || 0) + (convData.partially_solved_rate || 0)
      : 0;

    const cards = [
      {
        icon: TrendingUp,
        label: 'Total Convs',
        value: (convData.total_conversations ?? 0).toLocaleString(),
        subtext: 'conversations'
      },
      {
        icon: DollarSign,
        label: 'Avg Cost/Conv',
        value: `$${(convData.avg_cost ?? 0).toFixed(4)}`,
        subtext: 'per conversation'
      },
      {
        icon: MessageSquare,
        label: 'Feedback Rate',
        value: `${(convData.feedback_rate ?? 0).toFixed(1)}%`,
        subtext: `${convData.feedback_count ?? 0} ratings`
      },
      {
        icon: ThumbsUp,
        label: 'Satisfaction',
        value: `${satisfactionRate.toFixed(1)}%`,
        subtext: 'solved + partial'
      },
      {
        icon: MessagesSquare,
        label: 'Avg Exchanges',
        value: `~${Math.round(convData.avg_exchanges ?? 0)}`,
        subtext: 'messages/conv'
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

        {/* Rating Breakdown - Conversation View */}
        <div className="george-analytics-breakdown">
          <div className="george-analytics-breakdown-title">Rating Breakdown</div>
          <div className="george-analytics-breakdown-bars">
            <div className="george-analytics-breakdown-item">
              <div className="george-analytics-breakdown-label">
                <span className="george-analytics-breakdown-dot is-solved" />
                Solved
              </div>
              <div className="george-analytics-breakdown-bar">
                <div
                  className="george-analytics-breakdown-fill is-solved"
                  style={{ width: `${convData.solved_rate ?? 0}%` }}
                />
              </div>
              <div className="george-analytics-breakdown-value">{(convData.solved_rate ?? 0).toFixed(1)}%</div>
            </div>
            <div className="george-analytics-breakdown-item">
              <div className="george-analytics-breakdown-label">
                <span className="george-analytics-breakdown-dot is-partial" />
                Partially Solved
              </div>
              <div className="george-analytics-breakdown-bar">
                <div
                  className="george-analytics-breakdown-fill is-partial"
                  style={{ width: `${convData.partially_solved_rate ?? 0}%` }}
                />
              </div>
              <div className="george-analytics-breakdown-value">{(convData.partially_solved_rate ?? 0).toFixed(1)}%</div>
            </div>
            <div className="george-analytics-breakdown-item">
              <div className="george-analytics-breakdown-label">
                <span className="george-analytics-breakdown-dot is-not-solved" />
                Not Solved
              </div>
              <div className="george-analytics-breakdown-bar">
                <div
                  className="george-analytics-breakdown-fill is-not-solved"
                  style={{ width: `${convData.not_solved_rate ?? 0}%` }}
                />
              </div>
              <div className="george-analytics-breakdown-value">{(convData.not_solved_rate ?? 0).toFixed(1)}%</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Message view (default)
  const messageData = data as MessageOverviewData;

  // Defensive: if the data doesn't have message fields, show nothing
  if (messageData.total_runs === undefined) {
    return null;
  }

  const satisfactionRate = messageData.feedback_count > 0
    ? (messageData.good_rate ?? 0) + (messageData.perfect_rate ?? 0)
    : 0;

  const cards = [
    {
      icon: TrendingUp,
      label: 'Total Runs',
      value: (messageData.total_runs ?? 0).toLocaleString(),
      subtext: 'interactions'
    },
    {
      icon: DollarSign,
      label: 'Avg Cost/Run',
      value: `$${(messageData.avg_cost ?? 0).toFixed(4)}`,
      subtext: 'per interaction'
    },
    {
      icon: MessageSquare,
      label: 'Feedback Rate',
      value: `${(messageData.feedback_rate ?? 0).toFixed(1)}%`,
      subtext: `${messageData.feedback_count ?? 0} ratings`
    },
    {
      icon: ThumbsUp,
      label: 'Satisfaction',
      value: `${satisfactionRate.toFixed(1)}%`,
      subtext: 'good + perfect'
    },
    {
      icon: Clock,
      label: 'Avg Time',
      value: (messageData.avg_response_time ?? 0) > 1000
        ? `${((messageData.avg_response_time ?? 0) / 1000).toFixed(1)}s`
        : `${Math.round(messageData.avg_response_time ?? 0)}ms`,
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
                style={{ width: `${messageData.perfect_rate ?? 0}%` }}
              />
            </div>
            <div className="george-analytics-breakdown-value">{(messageData.perfect_rate ?? 0).toFixed(1)}%</div>
          </div>
          <div className="george-analytics-breakdown-item">
            <div className="george-analytics-breakdown-label">
              <span className="george-analytics-breakdown-dot is-good" />
              Good
            </div>
            <div className="george-analytics-breakdown-bar">
              <div
                className="george-analytics-breakdown-fill is-good"
                style={{ width: `${messageData.good_rate ?? 0}%` }}
              />
            </div>
            <div className="george-analytics-breakdown-value">{(messageData.good_rate ?? 0).toFixed(1)}%</div>
          </div>
          <div className="george-analytics-breakdown-item">
            <div className="george-analytics-breakdown-label">
              <span className="george-analytics-breakdown-dot is-usable" />
              Usable
            </div>
            <div className="george-analytics-breakdown-bar">
              <div
                className="george-analytics-breakdown-fill is-usable"
                style={{ width: `${messageData.usable_rate ?? 0}%` }}
              />
            </div>
            <div className="george-analytics-breakdown-value">{(messageData.usable_rate ?? 0).toFixed(1)}%</div>
          </div>
          <div className="george-analytics-breakdown-item">
            <div className="george-analytics-breakdown-label">
              <span className="george-analytics-breakdown-dot is-problematic" />
              Problematic
            </div>
            <div className="george-analytics-breakdown-bar">
              <div
                className="george-analytics-breakdown-fill is-problematic"
                style={{ width: `${messageData.problematic_rate ?? 0}%` }}
              />
            </div>
            <div className="george-analytics-breakdown-value">{(messageData.problematic_rate ?? 0).toFixed(1)}%</div>
          </div>
          <div className="george-analytics-breakdown-item">
            <div className="george-analytics-breakdown-label">
              <span className="george-analytics-breakdown-dot is-unusable" />
              Unusable
            </div>
            <div className="george-analytics-breakdown-bar">
              <div
                className="george-analytics-breakdown-fill is-unusable"
                style={{ width: `${messageData.unusable_rate ?? 0}%` }}
              />
            </div>
            <div className="george-analytics-breakdown-value">{(messageData.unusable_rate ?? 0).toFixed(1)}%</div>
          </div>
        </div>
      </div>
    </div>
  );
}
