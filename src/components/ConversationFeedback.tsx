'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, CircleDot, XCircle, MessageSquare } from 'lucide-react';

type FeedbackRating = 'solved' | 'partially_solved' | 'not_solved' | null;

type ConversationFeedbackProps = {
  conversationId: string | null;
  currentRating: FeedbackRating;
  currentComment: string | null;
  isHighlighted: boolean;
  isOpenExternal?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  onSubmit: (rating: FeedbackRating, comment: string) => Promise<void>;
};

export default function ConversationFeedback({
  conversationId,
  currentRating,
  currentComment,
  isHighlighted,
  isOpenExternal,
  onOpenChange,
  onSubmit
}: ConversationFeedbackProps) {
  const [isOpenInternal, setIsOpenInternal] = useState(false);
  const isOpen = isOpenExternal ?? isOpenInternal;
  const setIsOpen = (value: boolean) => {
    setIsOpenInternal(value);
    onOpenChange?.(value);
  };
  const [isClosing, setIsClosing] = useState(false);
  const [selectedRating, setSelectedRating] = useState<FeedbackRating>(currentRating);
  const [comment, setComment] = useState(currentComment || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setSelectedRating(currentRating);
    setComment(currentComment || '');
  }, [currentRating, currentComment, conversationId]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedRating(currentRating);
      setComment(currentComment || '');
    }
  }, [isOpen, currentRating, currentComment]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, 180);
  };

  const handleSubmit = async () => {
    if (!conversationId || !selectedRating) return;
    setIsSubmitting(true);
    try {
      await onSubmit(selectedRating, comment);
      handleClose();
    } catch (err) {
      console.error('Failed to submit feedback:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!conversationId) return null;

  const ratings: { value: FeedbackRating; label: string; icon: typeof CheckCircle }[] = [
    { value: 'solved', label: 'Solved', icon: CheckCircle },
    { value: 'partially_solved', label: 'Partial', icon: CircleDot },
    { value: 'not_solved', label: 'Not Solved', icon: XCircle }
  ];

  const hasExistingFeedback = currentRating !== null;

  return (
    <>
      <button
        type="button"
        className={`george-conversation-feedback-trigger${isHighlighted ? ' is-highlighted' : ''}${hasExistingFeedback ? ' has-feedback' : ''}`}
        onClick={() => setIsOpen(true)}
      >
        <MessageSquare size={16} />
        <span>{hasExistingFeedback ? 'Update Feedback' : 'Rate this chat'}</span>
      </button>

      {isOpen ? createPortal(
        <div
          className={`george-conversation-feedback-overlay${isClosing ? ' is-closing' : ''}`}
          role="dialog"
          aria-modal="true"
          onClick={handleClose}
        >
          <div
            className={`george-conversation-feedback-modal${isClosing ? ' is-closing' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="george-conversation-feedback-header">
              <h3 className="george-conversation-feedback-title">
                {hasExistingFeedback ? 'Is your feedback still accurate?' : 'How was this conversation?'}
              </h3>
              <button
                type="button"
                className="george-conversation-feedback-close"
                onClick={handleClose}
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            <div className="george-conversation-feedback-body">
              <div className="george-conversation-feedback-ratings">
                {ratings.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    className={`george-conversation-feedback-btn is-${value}${selectedRating === value ? ' is-selected' : ''}`}
                    onClick={() => setSelectedRating(value)}
                    disabled={isSubmitting}
                  >
                    <Icon size={20} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>

              <textarea
                className="george-conversation-feedback-comment"
                placeholder="Add a comment (optional)..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                disabled={isSubmitting}
                rows={3}
              />
            </div>

            <div className="george-conversation-feedback-footer">
              <button
                type="button"
                className="george-conversation-feedback-cancel"
                onClick={handleClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="george-conversation-feedback-submit"
                onClick={handleSubmit}
                disabled={!selectedRating || isSubmitting}
              >
                {isSubmitting ? 'Submitting...' : hasExistingFeedback ? 'Update Feedback' : 'Submit Feedback'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </>
  );
}
