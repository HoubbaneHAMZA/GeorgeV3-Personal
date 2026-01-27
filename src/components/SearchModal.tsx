'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase/client';

type SearchResult = {
  conversation_id: string;
  title: string | null;
  updated_at: string;
  snippet: string;
  match_in: 'user_input' | 'response';
};

type SearchModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSelectConversation: (conversationId: string) => void;
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;

  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));

  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <strong key={i} className="search-highlight">{part}</strong>
    ) : (
      part
    )
  );
}

export default function SearchModal({ isOpen, onClose, onSelectConversation }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Handle client-side mounting for portal
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
      setQuery('');
      setResults([]);
    }, 150);
  }, [onClose]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  // Search when query changes
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!query.trim()) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;

        if (!token) {
          setResults([]);
          return;
        }

        const response = await fetch(`/api/conversations/search?q=${encodeURIComponent(query)}`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          console.error('Search failed:', response.status);
          setResults([]);
          return;
        }

        const data = await response.json();
        setResults(data.results || []);
      } catch (error) {
        console.error('Search error:', error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  if (!isOpen || !mounted) return null;

  const modalContent = (
    <div
      className={`search-modal-overlay${isClosing ? ' is-closing' : ''}`}
      onClick={handleClose}
    >
      <div
        className={`search-modal${isClosing ? ' is-closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="search-modal-header">
          <input
            ref={inputRef}
            type="text"
            className="search-modal-input"
            placeholder="Search conversations..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            className="search-modal-close"
            onClick={handleClose}
            aria-label="Close search"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Results */}
        <div className="search-modal-results">
          {isLoading ? (
            <div className="search-modal-loading">Searching...</div>
          ) : query && results.length === 0 ? (
            <div className="search-modal-empty">No results found</div>
          ) : results.length > 0 ? (
            results.map((result) => (
              <button
                key={result.conversation_id}
                type="button"
                className="search-result-item"
                onClick={() => {
                  onSelectConversation(result.conversation_id);
                  handleClose();
                }}
              >
                <div className="search-result-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div className="search-result-content">
                  <div className="search-result-title">
                    {result.title || 'Untitled conversation'}
                  </div>
                  <div className="search-result-snippet">
                    {highlightMatch(result.snippet, query)}
                  </div>
                </div>
                <div className="search-result-date">
                  {formatDate(result.updated_at)}
                </div>
              </button>
            ))
          ) : (
            <div className="search-modal-hint">
              Type to search through your conversations
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
