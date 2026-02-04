'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Angry, Frown, Meh, Smile, Laugh } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import FeedbackPopover from './FeedbackPopover';

export type FeedbackRating = 'unusable' | 'problematic' | 'usable' | 'good' | 'perfect';

type SourceItem = { doc_id: string; url: string };

type MessageData = {
  sessionId: string;
  userInput: string;
  responseContent: string;
  responseSources?: SourceItem[];
  traceData?: unknown;
  timingServerMs?: number;
  attachmentsCount?: number;
};

type FeedbackButtonsProps = {
  interactionId: string | null;
  currentRating?: FeedbackRating | null;
  onFeedbackSubmit?: (rating: FeedbackRating, tags?: string[], comment?: string) => void;
  // Data needed to recreate interaction if deleted from Supabase
  messageData?: MessageData;
  // Called when a new interaction is created (after 404 on PATCH)
  onNewInteractionCreated?: (newId: string) => void;
};

const ratingConfig: Array<{
  value: FeedbackRating;
  Icon: typeof Frown;
  label: string;
  description: string;
}> = [
  { value: 'unusable', Icon: Angry, label: 'Unusable', description: 'complete rewrite required, incorrect information' },
  { value: 'problematic', Icon: Frown, label: 'Problematic', description: 'significant rewriting needed, some info incorrect' },
  { value: 'usable', Icon: Meh, label: 'Usable', description: 'moderate changes needed but core information present' },
  { value: 'good', Icon: Smile, label: 'Good', description: 'minor adjustments to tone/wording but content correct' },
  { value: 'perfect', Icon: Laugh, label: 'Perfect', description: 'used as-is or minimal formatting adjustments' },
];

export default function FeedbackButtons({
  interactionId,
  currentRating,
  onFeedbackSubmit,
  messageData,
  onNewInteractionCreated,
}: FeedbackButtonsProps) {
  const [selectedRating, setSelectedRating] = useState<FeedbackRating | null>(currentRating ?? null);
  const [popoverRating, setPopoverRating] = useState<FeedbackRating | null>(null);
  const [tooltipState, setTooltipState] = useState<{ rating: FeedbackRating; top: number; left: number } | null>(null);

  // Sync selectedRating when currentRating prop changes (e.g., when loading a conversation)
  useEffect(() => {
    setSelectedRating(currentRating ?? null);
  }, [currentRating]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState<{
    buttonTop: number;
    buttonLeft: number;
    buttonRight: number;
    popoverTop: number;
    openDirection: 'up' | 'down';
    maxHeight: number;
  } | null>(null);
  const buttonRefs = useRef<Record<FeedbackRating, HTMLButtonElement | null>>({
    unusable: null,
    problematic: null,
    usable: null,
    good: null,
    perfect: null,
  });

  const BUTTON_HEIGHT = 20;
  const PADDING = 20; // Padding from viewport edges

  const handleRatingClick = (rating: FeedbackRating) => {
    if (!interactionId) return;
    setTooltipState(null);
    // Capture button position BEFORE setting popoverRating (which hides the button)
    const btn = buttonRefs.current[rating];
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const buttonTop = rect.top;
      const buttonLeft = rect.left;
      const buttonRight = window.innerWidth - rect.right;

      // Calculate available space above and below the button
      const spaceAbove = buttonTop - PADDING;
      const spaceBelow = window.innerHeight - buttonTop - BUTTON_HEIGHT - PADDING;

      // Determine direction based on which has more space
      const openDirection = spaceBelow >= spaceAbove ? 'down' : 'up';

      // Calculate max height for the popover based on available space
      const maxHeight = Math.max(spaceAbove, spaceBelow);

      // Calculate popover top position - try to align with button, constrained to viewport
      let popoverTop: number;
      if (openDirection === 'down') {
        popoverTop = buttonTop;
      } else {
        // For 'up', we'll position from bottom in CSS, so store the bottom value
        popoverTop = buttonTop + BUTTON_HEIGHT;
      }

      // Set position first, then rating in same tick to avoid layout shift
      setPopoverPosition({ buttonTop, buttonLeft, buttonRight, popoverTop, openDirection, maxHeight });
      setPopoverRating(rating);
    }
  };

  const showTooltip = (rating: FeedbackRating) => {
    if (popoverRating) return;
    const btn = buttonRefs.current[rating];
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const left = rect.left + rect.width / 2;
    const top = rect.bottom + 8;
    setTooltipState({ rating, top, left });
  };

  const hideTooltip = () => {
    setTooltipState(null);
  };

  // Helper to animate close, then execute callback
  const animateClose = (callback?: () => void) => {
    setIsClosing(true);
    setTimeout(() => {
      setPopoverRating(null);
      setPopoverPosition(null);
      setIsClosing(false);
      callback?.();
    }, 200); // Match animation duration
  };

  const handlePopoverClose = () => {
    animateClose(() => {
      setSelectedRating(currentRating ?? null); // Revert to last submitted rating
    });
  };

  const handlePopoverSubmit = async (tags: string[], comment: string, newTags?: string[]) => {
    if (!interactionId || !popoverRating) return;

    setIsSubmitting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const response = await fetch(`/api/agent-interactions/message/${interactionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
        },
        body: JSON.stringify({
          feedback_rating: popoverRating,
          feedback_tags: tags.length > 0 ? tags : undefined,
          feedback_comment: comment || undefined,
          new_tags: newTags && newTags.length > 0 ? newTags : undefined,
        }),
      });

      // If interaction was deleted from Supabase, create a new one with feedback
      if (response.status === 404 && messageData) {
        console.warn('Interaction not found in Supabase, creating new one...');

        const createResponse = await fetch('/api/agent-interactions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
          },
          body: JSON.stringify({
            session_id: messageData.sessionId,
            user_input: messageData.userInput,
            response_content: messageData.responseContent,
            response_sources: messageData.responseSources,
            trace_data: messageData.traceData,
            timing_server_ms: messageData.timingServerMs,
            attachments_count: messageData.attachmentsCount || 0,
            // Include feedback in the new row
            feedback_rating: popoverRating,
            feedback_tags: tags.length > 0 ? tags : undefined,
            feedback_comment: comment || undefined,
          }),
        });

        if (createResponse.ok) {
          const result = await createResponse.json();
          if (result.id) {
            onNewInteractionCreated?.(result.id);
            onFeedbackSubmit?.(popoverRating, tags, comment);
          }
        } else {
          console.error('Failed to create new interaction:', await createResponse.text());
        }
        return;
      }

      if (!response.ok) {
        console.error('Failed to submit feedback:', await response.text());
      } else {
        onFeedbackSubmit?.(popoverRating, tags, comment);
      }
    } catch (err) {
      console.error('Error submitting feedback:', err);
    } finally {
      setIsSubmitting(false);
      animateClose();
    }
  };

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeConfig = popoverRating ? ratingConfig.find(r => r.value === popoverRating) : null;
  const tooltipConfig = tooltipState ? ratingConfig.find(r => r.value === tooltipState.rating) : null;

  return (
    <div className="george-feedback">
      {/* Blur overlay + floating button + popover in portal */}
      {popoverRating !== null && popoverPosition && mounted && createPortal(
        <>
          <div className={`george-feedback-overlay${isClosing ? ' is-closing' : ''}`} onClick={handlePopoverClose} />
          {/* Button positioned at original location using left for accuracy */}
          <button
            type="button"
            className="george-feedback-btn is-selected george-feedback-floating-btn"
            style={{ top: popoverPosition.buttonTop, left: popoverPosition.buttonLeft }}
            aria-label={activeConfig?.label}
          >
            {activeConfig && (
              <activeConfig.Icon
                className="george-feedback-icon"
                strokeWidth={2.5}
              />
            )}
          </button>
          {/* Popover positioned based on available space */}
          <div
            className={`george-feedback-floating-popover ${popoverPosition.openDirection === 'up' ? 'is-up' : 'is-down'}${isClosing ? ' is-closing' : ''}`}
            style={{
              ...(popoverPosition.openDirection === 'down'
                ? { top: popoverPosition.popoverTop }
                : { bottom: window.innerHeight - popoverPosition.popoverTop }),
              right: popoverPosition.buttonRight + 28,
              maxHeight: popoverPosition.maxHeight,
            }}
          >
            <FeedbackPopover
              rating={popoverRating}
              onSubmit={handlePopoverSubmit}
              onClose={handlePopoverClose}
              isSubmitting={isSubmitting}
            />
          </div>
        </>,
        document.body
      )}
      {tooltipState && tooltipConfig && mounted && popoverRating === null && createPortal(
        <div
          className="george-feedback-tooltip george-feedback-tooltip-portal"
          style={{ top: tooltipState.top, left: tooltipState.left }}
          role="tooltip"
        >
          <span className="george-feedback-tooltip-title">{tooltipConfig.label}</span>
          <span className="george-feedback-tooltip-desc">{tooltipConfig.description}</span>
        </div>,
        document.body
      )}
      <div className="george-feedback-buttons">
        {ratingConfig.map(({ value, Icon, label, description }) => {
          const isSelected = selectedRating === value;
          const isDisabled = selectedRating !== null && selectedRating !== value;
          const isHidden = popoverRating === value;

          return (
            <div key={value} className="george-feedback-btn-wrapper">
              <button
                ref={(el) => { buttonRefs.current[value] = el; }}
                type="button"
                className={`george-feedback-btn${isSelected ? ' is-selected' : ''}${isDisabled ? ' is-disabled' : ''}${isHidden ? ' is-hidden' : ''}`}
                onClick={() => handleRatingClick(value)}
                onMouseEnter={() => showTooltip(value)}
                onMouseLeave={hideTooltip}
                onFocus={() => showTooltip(value)}
                onBlur={hideTooltip}
                disabled={!interactionId || isSubmitting}
                aria-label={label}
                aria-pressed={isSelected}
              >
                <Icon
                  className="george-feedback-icon"
                  strokeWidth={isSelected ? 2.5 : 1.5}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
