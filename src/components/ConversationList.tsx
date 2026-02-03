'use client';

import { useState } from 'react';
import SearchModal from './SearchModal';

export type Conversation = {
  id: string;
  session_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
  message_count: number;
  feedback_rating: 'solved' | 'partially_solved' | 'not_solved' | null;
  feedback_comment: string | null;
  category: string | null;
  sub_category: string | null;
  ticket_id: string | null;
  ticket_last_fetched_at: string | null;
};

type ConversationListProps = {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (conversation: Conversation) => void;
  onSelectConversationById: (conversationId: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, newTitle: string) => void;
  isLoading: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onPrefetchConversation?: (conversationId: string) => void;
  onCancelPrefetch?: () => void;
};

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ConversationList({
  conversations,
  activeConversationId,
  onSelectConversation,
  onSelectConversationById,
  onNewChat,
  onDeleteConversation,
  onRenameConversation,
  isLoading,
  isCollapsed,
  onToggleCollapse,
  onPrefetchConversation,
  onCancelPrefetch
}: ConversationListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  const handleStartRename = (conv: Conversation) => {
    setEditingId(conv.id);
    setEditTitle(conv.title || '');
    setMenuOpenId(null);
  };

  const handleSaveRename = (id: string) => {
    if (editTitle.trim()) {
      onRenameConversation(id, editTitle.trim());
    }
    setEditingId(null);
    setEditTitle('');
  };

  const handleCancelRename = () => {
    setEditingId(null);
    setEditTitle('');
  };

  const handleDelete = (id: string) => {
    setMenuOpenId(null);
    onDeleteConversation(id);
  };

  const handleOpenSearch = () => {
    setIsSearchModalOpen(true);
  };

  // Sidebar toggle icon
  const toggleIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
    </svg>
  );

  // New chat icon
  const newChatIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );

  // Search icon
  const searchIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );

  // Unified sidebar - icons stay in place, text shows/hides
  return (
    <aside className={`conversation-sidebar${isCollapsed ? ' is-collapsed' : ''}`}>
      {/* Header row with toggle on the right */}
      <div className="conversation-sidebar-header">
        <button
          type="button"
          className="conversation-toggle-btn"
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {toggleIcon}
        </button>
      </div>

      {/* Menu items - icons always visible, text appears on expand */}
      <div className="conversation-menu-items">
        <button
          type="button"
          className="conversation-menu-item-btn"
          onClick={onNewChat}
        >
          {newChatIcon}
          {!isCollapsed && <span>New chat</span>}
        </button>
        <button
          type="button"
          className="conversation-menu-item-btn"
          onClick={handleOpenSearch}
        >
          {searchIcon}
          {!isCollapsed && <span>Search chats</span>}
        </button>
      </div>

      {/* Chats section - only show when expanded */}
      {!isCollapsed && <div className="conversation-section-title">Chats</div>}

      {!isCollapsed && <div className="conversation-list">
        {isLoading ? (
          <div className="conversation-loading">Loading conversations...</div>
        ) : conversations.length === 0 ? (
          <div className="conversation-empty">No conversations yet</div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              className={`conversation-item${activeConversationId === conv.id ? ' is-active' : ''}`}
            >
              {editingId === conv.id ? (
                <div className="conversation-edit">
                  <input
                    type="text"
                    className="conversation-edit-input"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveRename(conv.id);
                      if (e.key === 'Escape') handleCancelRename();
                    }}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="conversation-edit-save"
                    onClick={() => handleSaveRename(conv.id)}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="conversation-edit-cancel"
                    onClick={handleCancelRename}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    className="conversation-item-content"
                    onClick={() => onSelectConversation(conv)}
                    onMouseEnter={() => onPrefetchConversation?.(conv.id)}
                    onMouseLeave={() => onCancelPrefetch?.()}
                  >
                    <span className="conversation-item-title">
                      {conv.title || 'Untitled conversation'}
                    </span>
                    <span className="conversation-item-meta">
                      {formatRelativeTime(conv.updated_at)}
                      {conv.ticket_id && conv.ticket_last_fetched_at && (
                        <span className="conversation-item-ticket-fetched">
                          {' · Fetched '}{formatRelativeTime(conv.ticket_last_fetched_at)}
                        </span>
                      )}
                    </span>
                  </button>
                  <div className="conversation-item-actions">
                    <button
                      type="button"
                      className="conversation-menu-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenId(menuOpenId === conv.id ? null : conv.id);
                      }}
                      aria-label="More options"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="12" cy="19" r="2" />
                      </svg>
                    </button>
                    {menuOpenId === conv.id && (
                      <div className="conversation-menu">
                        <button
                          type="button"
                          className="conversation-menu-item"
                          onClick={() => handleStartRename(conv)}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="conversation-menu-item is-danger"
                          onClick={() => handleDelete(conv.id)}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>}

      {/* Search Modal */}
      <SearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        onSelectConversation={onSelectConversationById}
      />
    </aside>
  );
}
