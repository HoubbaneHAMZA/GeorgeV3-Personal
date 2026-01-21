'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { FeedbackRating } from './FeedbackButtons';

type FeedbackPopoverProps = {
  rating: FeedbackRating;
  onSubmit: (tags: string[], comment: string, newTags?: string[]) => void;
  onClose: () => void;
  isSubmitting: boolean;
};

const DEFAULT_TAGS = [
  "Didn't use the correct content",
  "Didn't clarify the customer's question",
  'Used the content incorrectly',
  "Tone wasn't right",
  'Answer length is too long or short',
  "Didn't speak in the right language",
];

export default function FeedbackPopover({
  rating,
  onSubmit,
  onClose,
  isSubmitting,
}: FeedbackPopoverProps) {
  const [tags, setTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [isLoadingTags, setIsLoadingTags] = useState(false);
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [otherTagValue, setOtherTagValue] = useState('');
  const [customTags, setCustomTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);
  const isBadRating = rating === 'bad';
  const showTags = rating === 'bad' || rating === 'okay';

  // Fetch tags from server
  useEffect(() => {
    const fetchTags = async () => {
      setIsLoadingTags(true);
      try {
        const response = await fetch('/api/agent-interactions/tags', { cache: 'no-store' });
        if (response.ok) {
          const data = await response.json();
          if (data.tags && Array.isArray(data.tags)) {
            const tagNames = data.tags.map((t: { name: string }) => t.name);
            setAvailableTags(tagNames);
          }
        }
      } catch (err) {
        console.error('Failed to fetch tags:', err);
        setAvailableTags(DEFAULT_TAGS);
      } finally {
        setIsLoadingTags(false);
      }
    };
    if (showTags) {
      fetchTags();
    }
  }, [showTags]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const toggleTag = (tag: string) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const handleOtherClick = () => {
    setShowOtherInput(true);
  };

  const addCustomTag = () => {
    const value = otherTagValue.trim();
    if (!value) return;

    if (availableTags.includes(value)) {
      setTags((prev) => (prev.includes(value) ? prev : [...prev, value]));
    } else if (!customTags.includes(value)) {
      setCustomTags((prev) => [...prev, value]);
    }
    setOtherTagValue('');
  };

  const removeCustomTag = (tag: string) => {
    setCustomTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleSubmit = () => {
    const pendingTag = showOtherInput && otherTagValue.trim() ? otherTagValue.trim() : undefined;
    const finalCustomTags = pendingTag ? [...customTags, pendingTag] : customTags;
    const finalTags = [...tags, ...finalCustomTags];
    onSubmit(finalTags, comment, finalCustomTags.length > 0 ? finalCustomTags : undefined);
  };

  const title = isBadRating
    ? 'What went wrong?'
    : rating === 'okay'
      ? 'What could be improved?'
      : 'Thanks! Any comment?';

  // For bad ratings, require at least one tag (either selected or typed in Other)
  // For okay ratings, tags are optional
  const hasOtherTag = showOtherInput && otherTagValue.trim().length > 0;
  const hasAtLeastOneTag = tags.length > 0 || customTags.length > 0 || hasOtherTag;
  const canSubmit = !isBadRating || hasAtLeastOneTag;

  return (
    <div className="george-feedback-popover" ref={popoverRef}>
      <div className="george-feedback-popover-header">
        <div className="george-feedback-popover-title">{title}</div>
        <button
          type="button"
          className="george-feedback-popover-close"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>

      <div className="george-feedback-popover-content">
        {showTags && (
          <div className="george-feedback-tags">
            {isLoadingTags && <span className="george-feedback-tags-loading">Loading tags...</span>}
            {!isLoadingTags && (
              <>
                {availableTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={`george-feedback-tag${tags.includes(tag) ? ' is-selected' : ''}`}
                    onClick={() => toggleTag(tag)}
                  >
                    {tag}
                  </button>
                ))}
                {customTags.map((tag) => (
                  <button
                    key={`custom-${tag}`}
                    type="button"
                    className="george-feedback-tag is-selected"
                    onClick={() => removeCustomTag(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </>
            )}
            {!showOtherInput ? (
              <button
                type="button"
                className="george-feedback-tag george-feedback-tag-other"
                onClick={handleOtherClick}
              >
                Other...
              </button>
            ) : (
              <input
                type="text"
                className="george-feedback-other-input"
                placeholder="Type your feedback..."
                value={otherTagValue}
                onChange={(e) => setOtherTagValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomTag();
                  }
                }}
                autoFocus
              />
            )}
          </div>
        )}

        <div className="george-feedback-comment">
          <label className="george-feedback-comment-label">
            Comment {isBadRating ? '(optional)' : '(optional)'}
          </label>
          <textarea
            className="george-feedback-textarea"
            placeholder="Any additional details..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
          />
        </div>
      </div>

      <div className="george-feedback-actions">
        <button
          type="button"
          className="george-feedback-action george-feedback-submit"
          onClick={handleSubmit}
          disabled={isSubmitting || !canSubmit}
        >
          {isSubmitting ? 'Submitting...' : 'Submit'}
        </button>
      </div>
    </div>
  );
}
