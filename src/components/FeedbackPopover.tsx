'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Search } from 'lucide-react';
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
const GOOD_ONLY_TAGS = [
  "Tone wasn't right",
  'The answer is too short',
  'The answer is too long',
  'Undocumented',
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
  const [tagSearch, setTagSearch] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);
  const isUnusableRating = rating === 'unusable';
  const isProblematicRating = rating === 'problematic';
  const isUsableRating = rating === 'usable';
  const isGoodRating = rating === 'good';
  const isPerfectRating = rating === 'perfect';
  const showTags = !isPerfectRating;
  const allowOther = isUsableRating || isProblematicRating || isUnusableRating;

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
      if (isGoodRating) {
        setAvailableTags(GOOD_ONLY_TAGS);
        setIsLoadingTags(false);
      } else {
        fetchTags();
      }
    }
  }, [showTags, isGoodRating]);

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
    if (!allowOther) return;
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

  const title = isUnusableRating
    ? 'What went wrong?'
    : rating === 'problematic'
      ? 'What could be improved?'
      : 'Thanks! Any comment?';

  // For unusable ratings, require at least one tag (either selected or typed in Other)
  // For problematic ratings, tags are optional
  const hasOtherTag = allowOther && showOtherInput && otherTagValue.trim().length > 0;
  const hasAtLeastOneTag = tags.length > 0 || customTags.length > 0 || hasOtherTag;
  const canSubmit = !(isUnusableRating || isProblematicRating) || hasAtLeastOneTag;

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
          <>
            {!isLoadingTags && availableTags.length > 6 && (
              <div className="george-feedback-tag-search">
                <Search size={14} className="george-feedback-tag-search-icon" />
                <input
                  type="text"
                  placeholder="Search tags..."
                  value={tagSearch}
                  onChange={(e) => setTagSearch(e.target.value)}
                  className="george-feedback-tag-search-input"
                />
              </div>
            )}
            <div className="george-feedback-tags">
              {isLoadingTags && (
                <>
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <span key={i} className="george-feedback-tag-skeleton" style={{ width: `${60 + (i % 3) * 40}px` }} />
                  ))}
                </>
              )}
              {!isLoadingTags && (
                <div className="george-feedback-tags-loaded">
                  {availableTags
                    .filter((tag) => tag.toLowerCase().includes(tagSearch.toLowerCase()))
                    .map((tag, index) => (
                      <button
                        key={tag}
                        type="button"
                        className={`george-feedback-tag${tags.includes(tag) ? ' is-selected' : ''}`}
                        onClick={() => toggleTag(tag)}
                        style={{ animationDelay: `${index * 30}ms` }}
                      >
                        {tag}
                      </button>
                    ))}
                  {customTags
                    .filter((tag) => tag.toLowerCase().includes(tagSearch.toLowerCase()))
                    .map((tag, index) => (
                      <button
                        key={`custom-${tag}`}
                        type="button"
                        className="george-feedback-tag is-selected"
                        onClick={() => removeCustomTag(tag)}
                        style={{ animationDelay: `${(availableTags.length + index) * 30}ms` }}
                      >
                        {tag}
                      </button>
                    ))}
                </div>
              )}
              {allowOther && !showOtherInput ? (
                <button
                  type="button"
                  className="george-feedback-tag george-feedback-tag-other"
                  onClick={handleOtherClick}
                >
                  Other...
                </button>
              ) : allowOther && showOtherInput ? (
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
              ) : null}
            </div>
          </>
        )}

        <div className="george-feedback-comment">
          <label className="george-feedback-comment-label">
            Comment {isUnusableRating ? '(optional)' : '(optional)'}
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
