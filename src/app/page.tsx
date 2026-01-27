'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import FeedbackButtons, { type FeedbackRating } from '@/components/FeedbackButtons';
import ConversationList, { type Conversation } from '@/components/ConversationList';
import ConversationFeedback from '@/components/ConversationFeedback';
import { useConversationPrefetch, prefetchConversation, type CachedConversation } from '@/hooks/useConversationCache';
import { useConversationsList } from '@/hooks/useConversationsList';
import { mutate as swrMutate } from 'swr';

function CollapsibleStep({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="step-item">
      <button 
        className="step-header" 
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <span className="step-title">{title}</span>
        <span className="step-toggle">{isOpen ? '−' : '+'}</span>
      </button>
      {isOpen && <div className="step-body">{children}</div>}
    </div>
  );
}

type TimingInfo = {
  round_trip_ms: number;
  server_ms?: number;
};

type AgentInputPayload = {
  metadata?: unknown;
  conversation?: unknown;
};

// FeedbackRating is imported from FeedbackButtons

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  trace?: AgentTraceData;
  timing?: TimingInfo;
  isTraceOpen?: boolean;
  isSourcesOpen?: boolean;
  collapsedTools?: Record<string, boolean>;
  interactionId?: string;
  feedbackRating?: FeedbackRating;
  feedbackReady?: boolean;
  // Data needed to recreate interaction if deleted from Supabase
  originalSessionId?: string;
  originalUserInput?: string;
};

type AgentTraceData = {
  queryAnalysis?: { metadata: Record<string, unknown>; isZendesk: boolean };
  attachments?: { total: number; cached: number; analyzed: number };
  agentThinking?: {
    queries: Array<{
      callId: string;
      tool: string;
      query: string;
      filters: unknown;
      sources: string[];
      output?: unknown;
    }>;
  };
};
type TraceQuery = {
  callId: string;
  tool: string;
  query: string;
  filters: unknown;
  sources: string[];
  output?: unknown;
};

type LocalAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
};

// Format filter key to readable label
function formatFilterKey(key: string): string {
  return key
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Check if output is a table structure (SQL result format)
function isTableOutput(output: unknown): output is { columns: string[]; rows: unknown[][]; row_count?: number; truncated?: boolean } {
  if (!output || typeof output !== 'object') return false;
  const obj = output as Record<string, unknown>;
  return Array.isArray(obj.columns) && Array.isArray(obj.rows);
}

function extractSqlTableName(query: string): string | null {
  const match = /\bfrom\s+([^\s;]+)/i.exec(query);
  if (!match) return null;
  return match[1].replace(/["'`]/g, '');
}

// Extract key-value pairs from filter structure
function extractFilterKeyValues(filters: unknown): Array<{ key: string; value: string }> {
  if (!filters || typeof filters !== 'object') return [];
  
  const filterObj = filters as Record<string, unknown>;
  
  // Handle compound filter structure: { type: "and", filters: [...] }
  if (filterObj.type === 'and' && Array.isArray(filterObj.filters)) {
    return filterObj.filters
      .filter((f: unknown) => f && typeof f === 'object')
      .map((f: Record<string, unknown>) => ({
        key: String(f.key || ''),
        value: String(f.value || '')
      }))
      .filter((kv) => kv.key && kv.value);
  }
  
  // Handle direct array of filters
  if (Array.isArray(filters)) {
    return filters
      .filter((f: unknown) => f && typeof f === 'object')
      .map((f: Record<string, unknown>) => ({
        key: String(f.key || ''),
        value: String(f.value || '')
      }))
      .filter((kv) => kv.key && kv.value);
  }
  
  return [];
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

function renderInlineMarkdown(escaped: string) {
  // Code spans first so we don't parse markdown inside them.
  const withCode = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Markdown links: [label](url)
  const withLinks = withCode.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  // Bold then italic (simple/common cases).
  const withBold = withLinks.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  const withItalic = withBold.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
  // Bare URLs
  const withBareUrls = withItalic.replace(
    /(^|[\s(])((https?:\/\/)[^\s<]+)/g,
    '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>'
  );
  return withBareUrls;
}

function renderMarkdownToHtml(markdown: string) {
  const src = String(markdown ?? '')
    .replace(/\r\n/g, '\n')
    // Normalize some common "lookalike" characters the model sometimes emits so markdown parsing works.
    // e.g. ∗ (U+2217) / ＊ (U+FF0A) instead of *
    .replace(/[\u2217\uFF0A]/g, '*')
    // e.g. – / — instead of hyphen-minus
    .replace(/[\u2013\u2014]/g, '-')
    // NBSP
    .replace(/\u00A0/g, ' ');
  const parts = src.split(/```/);
  let html = '';

  for (let i = 0; i < parts.length; i++) {
    const chunk = parts[i] ?? '';
    const isCode = i % 2 === 1;

    if (isCode) {
      // Allow an optional language tag on the first line: ```ts\ncode...
      const lines = chunk.split('\n');
      const first = (lines[0] ?? '').trim();
      const maybeLang = /^[a-zA-Z0-9_-]+$/.test(first) ? first : '';
      const code = maybeLang ? lines.slice(1).join('\n') : chunk;
      html += `<pre class="md-pre"><code class="md-code">${escapeHtml(code)}</code></pre>`;
      continue;
    }

    const escaped = escapeHtml(chunk);
    const lines = escaped.split('\n');
    let idx = 0;

    while (idx < lines.length) {
      const line = (lines[idx] ?? '').trimEnd();

      // Skip blank lines
      if (!line.trim()) {
        idx++;
        continue;
      }

      // Headings
      const h3 = /^###\s+(.+)$/.exec(line);
      const h2 = /^##\s+(.+)$/.exec(line);
      const h1 = /^#\s+(.+)$/.exec(line);
      if (h3 || h2 || h1) {
        const text = (h3?.[1] ?? h2?.[1] ?? h1?.[1] ?? '').trim();
        const tag = h3 ? 'h3' : h2 ? 'h2' : 'h1';
        html += `<${tag}>${renderInlineMarkdown(text)}</${tag}>`;
        idx++;
        continue;
      }

      // Unordered list
      if (/^[-*]\s+/.test(line.trim())) {
        html += '<ul>';
        while (idx < lines.length) {
          const liLine = (lines[idx] ?? '').trim();
          const match = /^[-*]\s+(.+)$/.exec(liLine);
          if (!match) break;
          html += `<li>${renderInlineMarkdown(match[1] ?? '')}</li>`;
          idx++;
        }
        html += '</ul>';
        continue;
      }

      // Paragraph: collect until blank line
      const paraLines: string[] = [];
      while (idx < lines.length) {
        const l = (lines[idx] ?? '').trimEnd();
        if (!l.trim()) break;
        // Stop before next list or heading
        if (/^###\s+/.test(l.trim()) || /^##\s+/.test(l.trim()) || /^#\s+/.test(l.trim()) || /^[-*]\s+/.test(l.trim())) {
          break;
        }
        paraLines.push(l);
        idx++;
      }
      const para = paraLines.join('<br />');
      html += `<p>${renderInlineMarkdown(para)}</p>`;
    }
  }

  return html;
}

async function consumeSseResponse(
  response: Response,
  handleEvent: (eventType: string, data: Record<string, unknown>) => void
) {
  if (!response.body) {
    const data = await response.json().catch(() => ({}));
    handleEvent('done', data as Record<string, unknown>);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let rawText = '';
  let sawEvent = false;

  const parseEventBlock = (block: string) => {
    const lines = block.split('\n');
    let eventType = 'message';
    let dataStr = '';

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventType = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataStr += line.slice(5).trim();
      }
    }

    if (!dataStr) return;
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(dataStr) as Record<string, unknown>;
    } catch {
      data = { text: dataStr };
    }
    sawEvent = true;
    handleEvent(eventType, data);
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    rawText += chunk;
    buffer += chunk;
    buffer = buffer.replace(/\r\n/g, '\n');
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      if (part.trim()) {
        parseEventBlock(part);
      }
    }
  }

  if (buffer.trim()) {
    parseEventBlock(buffer);
  }

  if (!sawEvent && rawText.trim()) {
    const looksLikeSSE = /^(event:|data:)/m.test(rawText);
    if (!looksLikeSSE) {
      const data = JSON.parse(rawText) as Record<string, unknown>;
      handleEvent('done', data);
    } else {
      throw new Error('Received SSE stream but failed to parse events.');
    }
  }
}

export default function Home() {
  const pathname = usePathname();
  const router = useRouter();
  const agentEndpoint = '/api/agent';
  const queryAnalysisEndpoint = '/api/query-analysis';
  const ticketFetchEndpoint = '/api/ticket-fetch';
  const costTrackerEndpoint = '/api/cost-tracker';
  const agentInteractionsEndpoint = '/api/agent-interactions';
  const sessionStorageKey = useMemo(() => `george:session:${pathname}`, [pathname]);
  const messagesStorageKey = useMemo(() => `george:messages:${pathname}`, [pathname]);
  const conversationIdStorageKey = useMemo(() => `george:conversationId:${pathname}`, [pathname]);
  const [input, setInput] = useState('');
  const [ticketError, setTicketError] = useState('');
  const [userEmailDraft, setUserEmailDraft] = useState('');
  const [userEmailTag, setUserEmailTag] = useState('');
  const [softwareDraft, setSoftwareDraft] = useState('');
  const [softwareTag, setSoftwareTag] = useState('');
  const [softwareVersionDraft, setSoftwareVersionDraft] = useState('');
  const [softwareVersionTag, setSoftwareVersionTag] = useState('');
  const [osDraft, setOsDraft] = useState('');
  const [osTag, setOsTag] = useState('');
  const [osVersionDraft, setOsVersionDraft] = useState('');
  const [osVersionTag, setOsVersionTag] = useState('');
  const [openDropdown, setOpenDropdown] = useState<'software' | 'softwareVersion' | 'os' | null>(null);
  const [dropdownPhase, setDropdownPhase] = useState<'open' | 'closing' | null>(null);
  const dropdownAnimTimeout = useRef<number | null>(null);
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);
  const [agentInterrupted, setAgentInterrupted] = useState<string | null>(null);
  const [showFeedbackReminder, setShowFeedbackReminder] = useState(false);
  const [isFeedbackReminderClosing, setIsFeedbackReminderClosing] = useState(false);
  const feedbackReminderCloseTimeout = useRef<number | null>(null);
  const [isZendeskNotFoundClosing, setIsZendeskNotFoundClosing] = useState(false);
  const [isAgentInterruptedClosing, setIsAgentInterruptedClosing] = useState(false);
  const [isAbortConfirmClosing, setIsAbortConfirmClosing] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const abortRequestedRef = useRef(false);
  const runModeRef = useRef<'initial' | 'chat' | null>(null);
  const zendeskCloseTimeout = useRef<number | null>(null);
  const agentInterruptedCloseTimeout = useRef<number | null>(null);
  const abortConfirmCloseTimeout = useRef<number | null>(null);
  const [dropdownRect, setDropdownRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const [dropdownReady, setDropdownReady] = useState(false);
  const [dropdownWidth, setDropdownWidth] = useState<number | null>(null);
  const [inlineError, setInlineError] = useState('');
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState('');
  const [zendeskNotFound, setZendeskNotFound] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [removingAttachmentIds, setRemovingAttachmentIds] = useState<Set<string>>(new Set());
  const attachmentErrorTimeout = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const softwareFieldRef = useRef<HTMLDivElement | null>(null);
  const softwareVersionFieldRef = useRef<HTMLDivElement | null>(null);
  const osFieldRef = useRef<HTMLDivElement | null>(null);
  const dropdownPortalRef = useRef<HTMLDivElement | null>(null);
  const inlineErrorTimeout = useRef<number | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  // Use SWR-cached conversations list
  const {
    conversations,
    accessToken: cachedAccessToken,
    isLoading: conversationsLoading,
    refresh: refreshConversations,
    updateConversationFeedback,
    removeConversation: removeConversationFromList,
    renameConversation: renameConversationInList
  } = useConversationsList();

  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [showConversationFeedbackHighlight, setShowConversationFeedbackHighlight] = useState(false);
  const [isConversationFeedbackOpen, setIsConversationFeedbackOpen] = useState(false);
  const conversationFeedbackHighlightTimeout = useRef<number | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sidebarCollapsed') === 'true';
    }
    return false;
  });
  const conversationCacheRef = useRef<Map<string, CachedConversation>>(new Map());
  const [error, setError] = useState('');
  const [infoOpen, setInfoOpen] = useState(false);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const infoRef = useRef<HTMLDivElement | null>(null);
  const traceBufferRef = useRef<AgentTraceData>({});
  const [steps, setSteps] = useState<{
    started: boolean;
    queryAnalysis?: { metadata: Record<string, unknown>; isZendesk: boolean };
    attachments?: { total: number; cached: number; analyzed: number };
    agentThinking?: { queries: Array<{ callId: string; tool: string; query: string; filters: unknown; sources: string[]; output?: unknown }> };
  }>({ started: false });
  const [statusSteps, setStatusSteps] = useState<Array<{ id: string; label: string }>>([]);
  const [activeStatusId, setActiveStatusId] = useState<string | null>(null);
  const [statusDone, setStatusDone] = useState(false);
  const [hasResponse, setHasResponse] = useState(false);
  const [isChatOverlayVisible, setIsChatOverlayVisible] = useState(false);
  const [metaOverlay, setMetaOverlay] = useState<{
    type: 'trace' | 'sources';
    messageIndex: number;
    anchorRect: DOMRect;
    align: 'left' | 'right';
    vertical: 'above' | 'below';
  } | null>(null);
  const [isMetaOverlayClosing, setIsMetaOverlayClosing] = useState(false);
  const metaOverlayCloseTimeout = useRef<number | null>(null);
  const [isChatAppearing, setIsChatAppearing] = useState(false);
  const chatAppearTimeout = useRef<number | null>(null);
  const [initialStreamStarted, setInitialStreamStarted] = useState(false);
  const [isReturningHome, setIsReturningHome] = useState(false);
  const returnHomeTimeout = useRef<number | null>(null);
  const thinkingRef = useRef<HTMLSpanElement | null>(null);
  const branchesRef = useRef<HTMLDivElement | null>(null);
  const [arrowPaths, setArrowPaths] = useState<string[]>([]);
  const [toolTagPositions, setToolTagPositions] = useState<Array<{ left: number; top: number }>>([]);
  const toolTagPositionsRef = useRef<Array<{ left: number; top: number }>>([]);
  const stepRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const chatTranscriptRef = useRef<HTMLDivElement | null>(null);
  const toolLayoutAnimRef = useRef<number | null>(null);
  const activeStatusIndex = activeStatusId
    ? statusSteps.findIndex((step) => step.id === activeStatusId)
    : -1;
  const currentStatusIndex =
    statusSteps.length === 0
      ? -1
      : statusDone
        ? statusSteps.length - 1
        : Math.max(activeStatusIndex, 0);
  const isChatMode = messages.length > 0;
  const currentConversation = useMemo(
    () => conversations.find((c) => c.id === conversationId) ?? null,
    [conversations, conversationId]
  );

  // Callback to store prefetched data in our local cache
  const handlePrefetchComplete = useCallback((convId: string, data: CachedConversation) => {
    conversationCacheRef.current.set(convId, data);
  }, []);

  // Prefetch hook for conversation hover
  const { handleMouseEnter: handlePrefetchEnter, handleMouseLeave: handlePrefetchLeave } =
    useConversationPrefetch(cachedAccessToken, handlePrefetchComplete);

  // Count exchanges (pairs of user + assistant messages)
  const exchangeCount = useMemo(
    () => Math.floor(messages.filter((m) => m.role === 'assistant').length),
    [messages]
  );
  // Extract ticket number if input starts with # followed by numbers only (initial mode only).
  const ticketMatch = !isChatMode ? input.match(/^(#\d+)(.*)$/) : null;
  const ticketTag = ticketMatch ? ticketMatch[1] : null;
  const inputAfterTag = ticketMatch ? ticketMatch[2] : input;
  const formatSourceLabel = (url: string) => {
    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.split('/').filter(Boolean);
      const last = parts.length > 0 ? parts[parts.length - 1] : parsed.hostname;
      const withoutExt = last.replace(/\.[a-z0-9]+$/i, '');
      const decoded = decodeURIComponent(withoutExt);
      const cleaned = decoded.replace(/[-_]+/g, ' ').trim();
      if (!cleaned) return url;
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    } catch {
      return url;
    }
  };
  const createAssistantMessage = (content: string): ChatMessage => ({
    role: 'assistant',
    content,
    sources: undefined,
    trace: undefined,
    timing: undefined,
    isTraceOpen: false,
    isSourcesOpen: false,
    collapsedTools: {}
  });
  const createUserMessage = (content: string): ChatMessage => ({
    role: 'user',
    content
  });
  const snapshotTraceData = (trace?: AgentTraceData | null): AgentTraceData | undefined => {
    if (!trace) return undefined;
    const snapshot: AgentTraceData = {};
    if (trace.queryAnalysis) {
      snapshot.queryAnalysis = {
        metadata: { ...trace.queryAnalysis.metadata },
        isZendesk: trace.queryAnalysis.isZendesk
      };
    }
    if (trace.attachments) {
      snapshot.attachments = { ...trace.attachments };
    }
    if (trace.agentThinking) {
      snapshot.agentThinking = {
        queries: trace.agentThinking.queries.map((q) => ({
          ...q,
          sources: Array.isArray(q.sources) ? [...q.sources] : []
        }))
      };
    }
    return snapshot;
  };
  const mergeTraceData = (local?: AgentTraceData | null, remote?: AgentTraceData | null): AgentTraceData | undefined => {
    if (!local && !remote) return undefined;
    const merged: AgentTraceData = {};
    if (local?.queryAnalysis) merged.queryAnalysis = { ...local.queryAnalysis };
    if (remote?.queryAnalysis) merged.queryAnalysis = { ...remote.queryAnalysis };
    if (local?.attachments) merged.attachments = { ...local.attachments };
    if (remote?.attachments) merged.attachments = { ...remote.attachments };
    const localQueries = local?.agentThinking?.queries || [];
    const remoteQueries = remote?.agentThinking?.queries || [];
    const byCallId = new Map<string, TraceQuery>();
    for (const query of localQueries) {
      byCallId.set(query.callId, { ...query, sources: [...(query.sources || [])] });
    }
    for (const query of remoteQueries) {
      const existing = byCallId.get(query.callId);
      if (existing) {
        byCallId.set(query.callId, {
          ...existing,
          ...query,
          sources: Array.from(new Set([...(existing.sources || []), ...(query.sources || [])]))
        });
      } else {
        byCallId.set(query.callId, { ...query, sources: [...(query.sources || [])] });
      }
    }
    if (byCallId.size > 0) {
      merged.agentThinking = { queries: Array.from(byCallId.values()) };
    }
    return merged;
  };
  const buildSourcesFromTrace = (trace?: AgentTraceData): string[] => {
    if (!trace?.agentThinking?.queries) return [];
    return Array.from(
      new Set(
        trace.agentThinking.queries
          .flatMap((q) => q.sources || [])
          .filter((url) => url.length > 0)
      )
    );
  };
  const isTicketMode = Boolean(ticketTag);
  const maxAttachments = 3;
  const attachmentsRemaining = Math.max(0, maxAttachments - attachments.length);
  const attachmentsDisabled = loading || isTicketMode || attachmentsRemaining === 0;
  const showInput = !hasResponse && !isChatMode;
  const showGeneratedBy = statusDone;
  const showInitialLoader = steps.started && !statusDone && !sessionId && !initialStreamStarted;
  const showTranscript = messages.length > 0 && (statusDone || sessionId || initialStreamStarted);

  // Fetch current user name for greeting
  useEffect(() => {
    const fetchUserName = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      // Try to get full_name from user metadata, fallback to email prefix
      const fullName = user?.user_metadata?.full_name;
      const emailPrefix = user?.email?.split('@')[0];
      setCurrentUserName(fullName || emailPrefix || null);
    };
    fetchUserName();
  }, []);

  useEffect(() => {
    if (!isTicketMode) return;
    if (attachments.length > 0) {
      setAttachments([]);
    }
    setAttachmentError('');
    setIsDragActive(false);
    setRemovingAttachmentIds(new Set());
  }, [isTicketMode, attachments.length]);
  const toolTags = useMemo(() => (
    Array.from(
      new Set(
        steps.agentThinking?.queries.map((q) =>
          q.tool.startsWith('vector_store_search_')
            ? q.tool.replace('vector_store_search_', '')
            : q.tool.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
        ) || []
      )
    )
  ), [steps.agentThinking?.queries]);
  const softwareOptions = useMemo(() => ([
    'filmpack',
    'nikcollection',
    'photolab',
    'pureraw',
    'viewpoint'
  ]), []);
  const softwareVersionsMap = useMemo(() => ({
    filmpack: ['8', '7', '6', '5', '4'],
    nikcollection: ['8', '7', '6', '5', '4', '3', '2'],
    photolab: ['9', '8', '7', '6', '5', '4', '3', '2', '1'],
    pureraw: ['5', '4', '3', '2', '1'],
    viewpoint: ['5', '4', '3', '2', '1']
  }), []);
  const osOptions = useMemo(() => (['macos', 'windows']), []);
  const softwareVersionOptions = useMemo(() => {
    const key = softwareTag.toLowerCase();
    return softwareVersionsMap[key as keyof typeof softwareVersionsMap] || [];
  }, [softwareTag, softwareVersionsMap]);
  const filteredSoftwareOptions = useMemo(() => {
    const query = softwareDraft.trim().toLowerCase();
    if (!query) return softwareOptions;
    return softwareOptions.filter((option) => option.includes(query));
  }, [softwareDraft, softwareOptions]);
  const filteredSoftwareVersionOptions = useMemo(() => {
    const query = softwareVersionDraft.trim();
    if (!query) return softwareVersionOptions;
    return softwareVersionOptions.filter((option) => option.includes(query));
  }, [softwareVersionDraft, softwareVersionOptions]);
  const filteredOsOptions = useMemo(() => {
    const query = osDraft.trim().toLowerCase();
    if (!query) return osOptions;
    return osOptions.filter((option) => option.includes(query));
  }, [osDraft, osOptions]);

  useEffect(() => {
    if (!softwareTag) {
      setSoftwareVersionTag('');
      setSoftwareVersionDraft('');
      return;
    }
    if (softwareVersionTag && !softwareVersionOptions.includes(softwareVersionTag)) {
      setSoftwareVersionTag('');
    }
  }, [softwareTag, softwareVersionOptions, softwareVersionTag]);

  useEffect(() => {
    setDropdownReady(true);
  }, []);

  const closeDropdown = (next?: 'software' | 'softwareVersion' | 'os' | null) => {
    if (!openDropdown || dropdownPhase === 'closing') return;
    setDropdownPhase('closing');
    if (dropdownAnimTimeout.current) {
      window.clearTimeout(dropdownAnimTimeout.current);
    }
    dropdownAnimTimeout.current = window.setTimeout(() => {
      setOpenDropdown(next ?? null);
      setDropdownPhase(next ? 'open' : null);
      dropdownAnimTimeout.current = null;
    }, 160);
  };

  const openDropdownWith = (next: 'software' | 'softwareVersion' | 'os') => {
    if (openDropdown === next && dropdownPhase !== 'closing') return;
    if (openDropdown && openDropdown !== next) {
      closeDropdown(next);
      return;
    }
    setOpenDropdown(next);
    setDropdownPhase('open');
  };

  useEffect(() => {
    if (!openDropdown) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      const softwareEl = document.getElementById('george-software-field');
      const softwareVersionEl = document.getElementById('george-software-version-field');
      const osEl = document.getElementById('george-os-field');
      const containers = [softwareEl, softwareVersionEl, osEl, dropdownPortalRef.current].filter(Boolean) as HTMLElement[];
      if (containers.some((el) => el.contains(target))) return;
      closeDropdown();
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [openDropdown]);

  const flashInlineError = (message: string) => {
    setInlineError(message);
    if (inlineErrorTimeout.current) {
      window.clearTimeout(inlineErrorTimeout.current);
    }
    inlineErrorTimeout.current = window.setTimeout(() => {
      setInlineError('');
    }, 2000);
  };

  const flashAttachmentError = (message: string) => {
    setAttachmentError(message);
    if (attachmentErrorTimeout.current) {
      window.clearTimeout(attachmentErrorTimeout.current);
    }
    attachmentErrorTimeout.current = window.setTimeout(() => {
      setAttachmentError('');
    }, 2500);
  };

  const logAttachmentSummary = (label: string) => {
    if (attachments.length === 0) return;
    const totalBytes = attachments.reduce((sum, item) => sum + item.size, 0);
    const totalDataUrlChars = attachments.reduce((sum, item) => sum + item.dataUrl.length, 0);
    console.log(`[attachments][${label}]`, {
      count: attachments.length,
      totalBytes,
      totalDataUrlChars,
      files: attachments.map((item) => ({
        name: item.name,
        type: item.type,
        size: item.size,
        dataUrlChars: item.dataUrl.length
      }))
    });
  };

  const addAttachments = async (files: File[]) => {
    if (files.length === 0) return;
    if (attachmentsRemaining === 0) {
      window.alert(`Max allowed attachments: ${maxAttachments}`);
      flashAttachmentError(`Max allowed attachments: ${maxAttachments}`);
      return;
    }
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length !== files.length) {
      window.alert('Only image files are supported.');
      flashAttachmentError('Only image files are supported.');
      return;
    }
    if (imageFiles.length > attachmentsRemaining) {
      window.alert(`Max allowed attachments: ${maxAttachments}`);
      flashAttachmentError(`Max allowed attachments: ${maxAttachments}`);
      return;
    }
    const additions = await Promise.all(
      imageFiles.map(async (file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl: await readFileAsDataUrl(file)
      }))
    );
    if (additions.length > 0) {
      setAttachments((prev) => {
        const existing = new Set(prev.map((item) => item.dataUrl));
        const seen = new Set<string>();
        const deduped = additions.filter((item) => {
          if (existing.has(item.dataUrl)) return false;
          if (seen.has(item.dataUrl)) return false;
          seen.add(item.dataUrl);
          return true;
        });
        return deduped.length > 0 ? [...prev, ...deduped] : prev;
      });
    }
  };

  const removeAttachment = (id: string) => {
    setRemovingAttachmentIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    window.setTimeout(() => {
      setAttachments((prev) => prev.filter((item) => item.id !== id));
      setRemovingAttachmentIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 170);
  };

  useLayoutEffect(() => {
    if (!openDropdown) {
      setDropdownRect(null);
      setDropdownWidth(null);
      return;
    }
    const target =
      openDropdown === 'software'
        ? softwareFieldRef.current
        : openDropdown === 'softwareVersion'
          ? softwareVersionFieldRef.current
          : osFieldRef.current;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    setDropdownRect({
      left: rect.left,
      top: rect.bottom + 6,
      width: rect.width
    });
  }, [openDropdown, softwareDraft, softwareVersionDraft, osDraft]);

  useLayoutEffect(() => {
    if (!openDropdown) return;
    const options =
      openDropdown === 'software'
        ? filteredSoftwareOptions
        : openDropdown === 'softwareVersion'
          ? filteredSoftwareVersionOptions
          : filteredOsOptions;
    const label = options.length === 0 ? ['No matches'] : options;
    const baseFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize || '16');
    const fontSize = Math.round(baseFontSize * 0.85);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return;
    context.font = `${fontSize}px "Geist Mono", "Geist Mono Fallback", monospace`;
    let maxWidth = 0;
    label.forEach((text) => {
      const { width } = context.measureText(text);
      if (width > maxWidth) maxWidth = width;
    });
    const padded = Math.ceil(maxWidth + 40);
    setDropdownWidth(Math.max(padded, 140));
  }, [openDropdown, filteredSoftwareOptions, filteredSoftwareVersionOptions, filteredOsOptions]);

  const resetConversation = () => {
    if (returnHomeTimeout.current) {
      window.clearTimeout(returnHomeTimeout.current);
      returnHomeTimeout.current = null;
    }
    setIsReturningHome(true);
    returnHomeTimeout.current = window.setTimeout(() => {
      setIsReturningHome(false);
      returnHomeTimeout.current = null;
    }, 420);
    setInput('');
    setTicketError('');
    setLoading(false);
    setMessages([]);
    setSessionId(null);
    setConversationId(null);
    traceBufferRef.current = {};
    try {
      localStorage.removeItem(sessionStorageKey);
      localStorage.removeItem(messagesStorageKey);
      localStorage.removeItem(conversationIdStorageKey);
    } catch {
      // Ignore storage failures (private mode, SSR).
    }
    setError('');
    setSteps({ started: false });
    setStatusSteps([]);
    setActiveStatusId(null);
    setStatusDone(false);
    setHasResponse(false);
    setIsChatOverlayVisible(false);
    setInitialStreamStarted(false);
  };

  // Check for orphaned localStorage data when conversations load
  useEffect(() => {
    if (conversationsLoading || conversations.length === 0) return;

    const storedSessionId = localStorage.getItem(sessionStorageKey);
    if (storedSessionId) {
      const sessionExists = conversations.some(
        (conv) => conv.session_id === storedSessionId
      );
      if (!sessionExists) {
        // Clear orphaned local data
        console.log('[useEffect] Clearing orphaned localStorage data for session:', storedSessionId);
        localStorage.removeItem(sessionStorageKey);
        localStorage.removeItem(messagesStorageKey);
        localStorage.removeItem(conversationIdStorageKey);
        setSessionId(null);
        setConversationId(null);
        setMessages([]);
      }
    }
  }, [conversations, conversationsLoading, sessionStorageKey, messagesStorageKey, conversationIdStorageKey]);

  // Persist sidebar collapsed state to localStorage
  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // Highlight conversation feedback after every 5 exchanges
  // If no feedback yet: remind to submit. If feedback exists: remind to verify it's still accurate.
  useEffect(() => {
    if (exchangeCount > 0 && exchangeCount % 5 === 0) {
      setShowConversationFeedbackHighlight(true);
      if (conversationFeedbackHighlightTimeout.current) {
        window.clearTimeout(conversationFeedbackHighlightTimeout.current);
      }
      conversationFeedbackHighlightTimeout.current = window.setTimeout(() => {
        setShowConversationFeedbackHighlight(false);
        conversationFeedbackHighlightTimeout.current = null;
      }, 3000);
    }
  }, [exchangeCount]);

  // Cleanup feedback highlight timeout
  useEffect(() => {
    return () => {
      if (conversationFeedbackHighlightTimeout.current) {
        window.clearTimeout(conversationFeedbackHighlightTimeout.current);
      }
    };
  }, []);

  // Submit conversation feedback
  const handleConversationFeedbackSubmit = useCallback(async (
    rating: 'solved' | 'partially_solved' | 'not_solved' | null,
    comment: string
  ) => {
    if (!conversationId) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) return;

    const response = await fetch(`/api/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        feedback_rating: rating,
        feedback_comment: comment || null
      })
    });

    if (response.ok) {
      // Update the local conversations list with the new feedback
      if (rating) {
        updateConversationFeedback(conversationId, rating, comment);
      }
      setShowConversationFeedbackHighlight(false);
    }
  }, [conversationId, updateConversationFeedback]);

  // Helper to convert API messages to ChatMessage format
  const convertApiMessages = useCallback((apiMessages: CachedConversation['messages'], sessionId: string): ChatMessage[] => {
    const loadedMessages: ChatMessage[] = [];
    for (const msg of apiMessages || []) {
      // Add user message
      loadedMessages.push({
        role: 'user',
        content: msg.user_input
      });
      // Add assistant response
      loadedMessages.push({
        role: 'assistant',
        content: msg.response_content,
        sources: msg.response_sources,
        trace: msg.trace_data as AgentTraceData | undefined,
        timing: msg.timing_server_ms ? { server_ms: msg.timing_server_ms, round_trip_ms: 0 } : undefined,
        interactionId: msg.id,
        feedbackRating: msg.feedback_rating ? (msg.feedback_rating as FeedbackRating) : undefined,
        feedbackReady: true,
        originalSessionId: sessionId,
        originalUserInput: msg.user_input
      });
    }
    return loadedMessages;
  }, []);

  // Handle selecting a conversation from the list (with caching + optimistic UI)
  const handleSelectConversation = useCallback(async (conversation: Conversation, retries = 2) => {
    // Skip if already on this conversation
    if (conversationId === conversation.id) return;

    // Check SWR cache first for instant loading
    const cacheKey = `/api/conversations/${conversation.id}`;
    const cachedData = conversationCacheRef.current.get(conversation.id);

    // OPTIMISTIC UI: If we have cached data, show it immediately
    if (cachedData) {
      // Instant switch - no loading state needed
      const loadedMessages = convertApiMessages(cachedData.messages, conversation.session_id);
      setSessionId(cachedData.conversation?.session_id || conversation.session_id);
      setConversationId(conversation.id);
      setMessages(loadedMessages);
      setHasResponse(loadedMessages.length > 0);
      setStatusDone(true);
      return;
    }

    // No cache - need to fetch (show loading state)
    setIsLoadingConversation(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        setIsLoadingConversation(false);
        return;
      }

      // Check SWR global cache
      const swrCacheKey = [cacheKey, accessToken];
      let data: CachedConversation | undefined;

      // Try to get from SWR cache via a quick fetch that may hit cache
      try {
        const response = await fetch(cacheKey, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (response.ok) {
          const fetchedData: CachedConversation = await response.json();
          data = fetchedData;

          // Store in our local cache for next time
          conversationCacheRef.current.set(conversation.id, fetchedData);

          // Also update SWR cache
          swrMutate(swrCacheKey, fetchedData, { revalidate: false });
        }
      } catch {
        // Fall through to retry logic
      }

      if (data) {
        // Convert messages and update state in one go to avoid flash
        const loadedMessages = convertApiMessages(data.messages, conversation.session_id);

        // Use session_id from API response (more reliable than the passed conversation object)
        setSessionId(data.conversation?.session_id || conversation.session_id);
        setConversationId(conversation.id);
        setMessages(loadedMessages);
        setHasResponse(loadedMessages.length > 0);
        setStatusDone(true);
        setIsLoadingConversation(false);
      } else if (retries > 0) {
        // Retry on failure
        await new Promise((r) => setTimeout(r, 1000));
        return handleSelectConversation(conversation, retries - 1);
      } else {
        setIsLoadingConversation(false);
      }
    } catch (err) {
      console.error('Failed to load conversation:', err);
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, 1000));
        return handleSelectConversation(conversation, retries - 1);
      }
      setIsLoadingConversation(false);
    }
  }, [conversationId, convertApiMessages]);

  // Handle selecting a conversation by ID (for search results)
  const handleSelectConversationById = useCallback((id: string) => {
    // Try to find the conversation in our list
    const conversation = conversations.find((c) => c.id === id);
    if (conversation) {
      handleSelectConversation(conversation);
    } else {
      // If not found in list, create a minimal conversation object
      // The handler will fetch the full details
      handleSelectConversation({
        id,
        session_id: '',
        title: null,
        created_at: '',
        updated_at: '',
        is_archived: false,
        message_count: 0,
        feedback_rating: null,
        feedback_comment: null,
        category: null,
        sub_category: null
      });
    }
  }, [conversations, handleSelectConversation]);

  // Handle deleting a conversation
  const handleDeleteConversation = useCallback(async (id: string) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) return;

      const response = await fetch(`/api/conversations/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (response.ok) {
        removeConversationFromList(id);
        // If we deleted the current conversation, reset
        if (conversationId === id) {
          resetConversation();
        }
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  }, [conversationId, resetConversation, removeConversationFromList]);

  // Handle renaming a conversation
  const handleRenameConversation = useCallback(async (id: string, newTitle: string) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) return;

      const response = await fetch(`/api/conversations/${id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title: newTitle })
      });

      if (response.ok) {
        renameConversationInList(id, newTitle);
      }
    } catch (err) {
      console.error('Failed to rename conversation:', err);
    }
  }, [renameConversationInList]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(sessionStorageKey);
      if (stored && !sessionId) {
        setSessionId(stored);
      }
    } catch {
      // Ignore storage failures.
    }
  }, [sessionStorageKey, sessionId]);

  // Restore conversationId from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(conversationIdStorageKey);
      if (stored && !conversationId) {
        setConversationId(stored);
      }
    } catch {
      // Ignore storage failures.
    }
  }, [conversationIdStorageKey, conversationId]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(messagesStorageKey);
      if (!stored || messages.length > 0) return;
      const parsed = JSON.parse(stored) as ChatMessage[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Keep feedbackRating from localStorage - sync will update/clear as needed
        setMessages(parsed);
        setHasResponse(true);
        setStatusDone(true);
      }
    } catch {
      // Ignore storage failures.
    }
  }, [messages.length, messagesStorageKey]);

  // Sync feedback ratings from Supabase after loading messages from localStorage
  const feedbackSyncedRef = useRef(false);
  const [messagesLoadedFromStorage, setMessagesLoadedFromStorage] = useState(false);

  // Mark when messages are loaded from localStorage
  useEffect(() => {
    if (messages.length > 0 && !messagesLoadedFromStorage) {
      setMessagesLoadedFromStorage(true);
    }
  }, [messages.length, messagesLoadedFromStorage]);

  useEffect(() => {
    // Only run once after messages are loaded from localStorage
    if (feedbackSyncedRef.current || !messagesLoadedFromStorage) return;

    const interactionIds = messages
      .filter((m) => m.interactionId)
      .map((m) => m.interactionId!);

    if (interactionIds.length === 0) {
      feedbackSyncedRef.current = true;
      return;
    }

    feedbackSyncedRef.current = true;

    const syncFeedbackFromSupabase = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token;
        if (!accessToken) return;

        const response = await fetch(`/api/agent-interactions?ids=${interactionIds.join(',')}`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!response.ok) return;

        const { interactions } = await response.json();
        if (!interactions || !Array.isArray(interactions)) return;

        // Valid ratings for the current FeedbackButtons component
        const validRatings: FeedbackRating[] = ['unusable', 'problematic', 'usable', 'good', 'perfect'];
        const isValidRating = (r: string | null | undefined): r is FeedbackRating =>
          r !== null && r !== undefined && validRatings.includes(r as FeedbackRating);

        // Create a map for quick lookup - only includes IDs that exist in Supabase
        const feedbackMap = new Map<string, string | null>(
          interactions.map((i: { id: string; feedback_rating: string | null }) => [i.id, i.feedback_rating])
        );

        // Update messages with fetched feedback
        setMessages((prev) =>
          prev.map((m) => {
            if (!m.interactionId) return m;

            // If interaction exists in Supabase, use its rating (only if valid)
            if (feedbackMap.has(m.interactionId)) {
              const rating = feedbackMap.get(m.interactionId);
              // Filter out old invalid ratings like 'very_good'
              return { ...m, feedbackRating: isValidRating(rating) ? rating : undefined };
            }

            // If interaction was deleted from Supabase (not in response), clear the rating
            if (m.feedbackRating) {
              return { ...m, feedbackRating: undefined };
            }

            return m;
          })
        );
      } catch (err) {
        console.error('Failed to sync feedback from Supabase:', err);
      }
    };

    syncFeedbackFromSupabase();
  }, [messagesLoadedFromStorage, messages]);

  useEffect(() => {
    if (!sessionId) return;
    try {
      localStorage.setItem(sessionStorageKey, sessionId);
    } catch {
      // Ignore storage failures.
    }
  }, [sessionId, sessionStorageKey]);

  // Persist conversationId to localStorage
  useEffect(() => {
    try {
      if (!conversationId) {
        localStorage.removeItem(conversationIdStorageKey);
        return;
      }
      localStorage.setItem(conversationIdStorageKey, conversationId);
    } catch {
      // Ignore storage failures.
    }
  }, [conversationId, conversationIdStorageKey]);

  useEffect(() => {
    try {
      if (messages.length === 0) {
        localStorage.removeItem(messagesStorageKey);
        return;
      }
      localStorage.setItem(messagesStorageKey, JSON.stringify(messages));
    } catch {
      // Ignore storage failures.
    }
  }, [messages, messagesStorageKey]);

  useLayoutEffect(() => {
    if (toolLayoutAnimRef.current) {
      cancelAnimationFrame(toolLayoutAnimRef.current);
      toolLayoutAnimRef.current = null;
    }
    if (!branchesRef.current || !thinkingRef.current) {
      setArrowPaths([]);
      setToolTagPositions([]);
      toolTagPositionsRef.current = [];
      return;
    }
    if (toolTags.length === 0) {
      setArrowPaths([]);
      setToolTagPositions([]);
      toolTagPositionsRef.current = [];
      return;
    }
    const container = branchesRef.current;
    const anchor = thinkingRef.current;
    const containerRect = container.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const anchorX = anchorRect.left + anchorRect.width / 2 - containerRect.left;
    const anchorY = anchorRect.top + anchorRect.height / 2 - containerRect.top;

    const width = Math.max(containerRect.width, 360);
    const height = Math.max(containerRect.height, 260);
    const maxPerRing = 4;
    const baseRadius = 200;
    const ringGap = 80;
    const startAngle = Math.PI * 0.85;
    const endAngle = Math.PI * 0.15;

    const nextPositions = toolTags.map((label, index) => {
      const ringIndex = Math.floor(index / maxPerRing);
      const ringStart = ringIndex * maxPerRing;
      const ringCount = Math.min(maxPerRing, toolTags.length - ringStart);
      const positionIndex = index - ringStart;
      const angle =
        ringCount === 1
          ? Math.PI / 2
          : startAngle + (endAngle - startAngle) * (positionIndex / (ringCount - 1));
      const radius = baseRadius + ringIndex * ringGap;
      let left = anchorX + Math.cos(angle) * radius;
      let top = anchorY + Math.sin(angle) * radius + ringIndex * 8;
      left = Math.max(48, Math.min(width - 48, left));
      top = Math.max(anchorY + 36, Math.min(height - 36, top));
      return { left, top, angle };
    });

    const buildPaths = (positions: Array<{ left: number; top: number; angle: number }>) =>
      positions.map((pos) => {
        const dx = pos.left - anchorX;
        const dy = pos.top - anchorY;
        const dist = Math.hypot(dx, dy) || 1;
        const nx = dx / dist;
        const ny = dy / dist;
        const perpX = -ny;
        const perpY = nx;
        const direction = nx >= 0 ? -1 : 1;
        const curve = 18;
        const offsetX = perpX * curve * direction;
        const offsetY = perpY * curve * direction;
        const ctrl1X = anchorX + nx * dist * 0.35 + offsetX;
        const ctrl1Y = anchorY + ny * dist * 0.35 + offsetY;
        const ctrl2X = anchorX + nx * dist * 0.7 + offsetX;
        const ctrl2Y = anchorY + ny * dist * 0.7 + offsetY;
        return `M ${anchorX} ${anchorY} C ${ctrl1X} ${ctrl1Y}, ${ctrl2X} ${ctrl2Y}, ${pos.left} ${pos.top}`;
      });

    if (
      toolTagPositionsRef.current.length === 0 ||
      toolTagPositionsRef.current.length !== nextPositions.length
    ) {
      const immediatePositions = nextPositions.map(({ left, top }) => ({ left, top }));
      toolTagPositionsRef.current = immediatePositions;
      setToolTagPositions(immediatePositions);
      setArrowPaths(buildPaths(nextPositions));
      return;
    }

    const prevPositions = toolTagPositionsRef.current.map((pos, index) => ({
      left: pos.left,
      top: pos.top,
      angle: nextPositions[index]?.angle ?? 0
    }));
    const duration = 360;
    const start = performance.now();
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const animate = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = easeOutCubic(t);
      const blended = nextPositions.map((nextPos, index) => {
        const prev = prevPositions[index] || nextPos;
        return {
          left: prev.left + (nextPos.left - prev.left) * eased,
          top: prev.top + (nextPos.top - prev.top) * eased,
          angle: nextPos.angle
        };
      });
      const blendedPositions = blended.map(({ left, top }) => ({ left, top }));
      toolTagPositionsRef.current = blendedPositions;
      setToolTagPositions(blendedPositions);
      setArrowPaths(buildPaths(blended));
      if (t < 1) {
        toolLayoutAnimRef.current = requestAnimationFrame(animate);
      } else {
        toolLayoutAnimRef.current = null;
      }
    };
    toolLayoutAnimRef.current = requestAnimationFrame(animate);
    return () => {
      if (toolLayoutAnimRef.current) {
        cancelAnimationFrame(toolLayoutAnimRef.current);
        toolLayoutAnimRef.current = null;
      }
    };
  }, [toolTags, statusSteps.length, activeStatusId]);

  useEffect(() => {
    if (!loading || !showTranscript) return;
    const transcript = chatTranscriptRef.current;
    if (!transcript) return;
    transcript.scrollTop = transcript.scrollHeight;
  }, [loading, showTranscript, messages]);

  useEffect(() => {
    if (!infoOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!infoRef.current) return;
      if (!infoRef.current.contains(event.target as Node)) {
        setInfoOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [infoOpen]);

  const handleAttachmentChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (attachmentsDisabled) return;
    const files = event.target.files ? Array.from(event.target.files) : [];
    await addAttachments(files);
    event.target.value = '';
  };

  const handleAttachmentDrop = async (event: React.DragEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    if (attachmentsDisabled) return;
    if (isTicketMode) {
      flashAttachmentError('Attachments are disabled for ticket lookups.');
      return;
    }
    const files = Array.from(event.dataTransfer.files || []);
    await addAttachments(files);
  };

  const handleAttachmentDragOver = (event: React.DragEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (attachmentsDisabled) return;
    setIsDragActive(true);
  };

  const handleAttachmentDragLeave = (event: React.DragEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    setIsDragActive(false);
  };

  const handleZendeskNotFound = (message: string) => {
    setZendeskNotFound(message);
    setIsZendeskNotFoundClosing(false);
    setMessages([]);
    setSessionId(null);
    setHasResponse(false);
    setStatusSteps([]);
    setActiveStatusId(null);
    setStatusDone(false);
    setSteps({ started: false });
    setIsChatOverlayVisible(false);
    try {
      localStorage.removeItem(messagesStorageKey);
      localStorage.removeItem(sessionStorageKey);
      localStorage.removeItem(conversationIdStorageKey);
    } catch {
      // Ignore storage failures.
    }
  };
  const handleAgentInterrupted = (message: string) => {
    setAgentInterrupted(message);
    setIsAgentInterruptedClosing(false);
    setMessages([]);
    setSessionId(null);
    setHasResponse(false);
    setStatusSteps([]);
    setActiveStatusId(null);
    setStatusDone(false);
    setSteps({ started: false });
    setIsChatOverlayVisible(false);
    try {
      localStorage.removeItem(messagesStorageKey);
      localStorage.removeItem(sessionStorageKey);
      localStorage.removeItem(conversationIdStorageKey);
    } catch {
      // Ignore storage failures.
    }
  };
  const closeAgentInterrupted = () => {
    if (!agentInterrupted || isAgentInterruptedClosing) return;
    setIsAgentInterruptedClosing(true);
    if (agentInterruptedCloseTimeout.current) {
      window.clearTimeout(agentInterruptedCloseTimeout.current);
    }
    agentInterruptedCloseTimeout.current = window.setTimeout(() => {
      setAgentInterrupted(null);
      setIsAgentInterruptedClosing(false);
      agentInterruptedCloseTimeout.current = null;
    }, 180);
  };
  const removeLastExchange = () => {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      let removedAssistant = false;
      for (let i = next.length - 1; i >= 0; i -= 1) {
        if (next[i].role === 'assistant') {
          next.splice(i, 1);
          removedAssistant = true;
          break;
        }
      }
      for (let i = next.length - 1; i >= 0; i -= 1) {
        if (next[i].role === 'user') {
          next.splice(i, 1);
          break;
        }
      }
      return removedAssistant ? next : next;
    });
  };
  const requestAbort = () => {
    if (!loading) return;
    setIsAbortConfirmClosing(false);
    setShowAbortConfirm(true);
  };
  const cancelAbort = () => {
    if (!showAbortConfirm || isAbortConfirmClosing) return;
    setIsAbortConfirmClosing(true);
    if (abortConfirmCloseTimeout.current) {
      window.clearTimeout(abortConfirmCloseTimeout.current);
    }
    abortConfirmCloseTimeout.current = window.setTimeout(() => {
      setShowAbortConfirm(false);
      setIsAbortConfirmClosing(false);
      abortConfirmCloseTimeout.current = null;
    }, 180);
  };
  const confirmAbort = () => {
    if (isAbortConfirmClosing) return;
    setIsAbortConfirmClosing(true);
    if (abortConfirmCloseTimeout.current) {
      window.clearTimeout(abortConfirmCloseTimeout.current);
    }
    abortConfirmCloseTimeout.current = window.setTimeout(() => {
      setShowAbortConfirm(false);
      setIsAbortConfirmClosing(false);
      abortConfirmCloseTimeout.current = null;
    }, 180);
    abortRequestedRef.current = true;
    abortControllerRef.current?.abort();
    if (runModeRef.current === 'initial') {
      handleAgentInterrupted('Agent was interrupted. Please ask your question again.');
    } else if (runModeRef.current === 'chat') {
      removeLastExchange();
      setStatusSteps([]);
      setActiveStatusId(null);
      setStatusDone(false);
      setSteps((prev) => ({ ...prev, started: false, agentThinking: undefined }));
      setIsChatOverlayVisible(false);
    }
  };
  const requestNewChat = () => {
    // Show feedback reminder popup if there's a conversation with messages
    if (conversationId && messages.length > 0) {
      setIsFeedbackReminderClosing(false);
      setShowFeedbackReminder(true);
      return;
    }
    // No conversation or no messages - directly start new chat
    abortRequestedRef.current = true;
    abortControllerRef.current?.abort();
    resetConversation();
  };
  const closeFeedbackReminder = () => {
    if (!showFeedbackReminder || isFeedbackReminderClosing) return;
    setIsFeedbackReminderClosing(true);
    if (feedbackReminderCloseTimeout.current) {
      window.clearTimeout(feedbackReminderCloseTimeout.current);
    }
    feedbackReminderCloseTimeout.current = window.setTimeout(() => {
      setShowFeedbackReminder(false);
      setIsFeedbackReminderClosing(false);
      feedbackReminderCloseTimeout.current = null;
    }, 180);
  };
  const closeFeedbackReminderAndOpenFeedback = () => {
    if (!showFeedbackReminder || isFeedbackReminderClosing) return;
    setIsFeedbackReminderClosing(true);
    if (feedbackReminderCloseTimeout.current) {
      window.clearTimeout(feedbackReminderCloseTimeout.current);
    }
    feedbackReminderCloseTimeout.current = window.setTimeout(() => {
      setShowFeedbackReminder(false);
      setIsFeedbackReminderClosing(false);
      feedbackReminderCloseTimeout.current = null;
      // Open the feedback modal
      setIsConversationFeedbackOpen(true);
    }, 180);
  };
  const skipFeedbackAndStartNewChat = () => {
    if (isFeedbackReminderClosing) return;
    setIsFeedbackReminderClosing(true);
    if (feedbackReminderCloseTimeout.current) {
      window.clearTimeout(feedbackReminderCloseTimeout.current);
    }
    feedbackReminderCloseTimeout.current = window.setTimeout(() => {
      setShowFeedbackReminder(false);
      setIsFeedbackReminderClosing(false);
      feedbackReminderCloseTimeout.current = null;
      // Directly start new chat
      abortRequestedRef.current = true;
      abortControllerRef.current?.abort();
      resetConversation();
    }, 180);
  };
  const closeZendeskNotFound = () => {
    if (!zendeskNotFound || isZendeskNotFoundClosing) return;
    setIsZendeskNotFoundClosing(true);
    if (zendeskCloseTimeout.current) {
      window.clearTimeout(zendeskCloseTimeout.current);
    }
    zendeskCloseTimeout.current = window.setTimeout(() => {
      setZendeskNotFound(null);
      setIsZendeskNotFoundClosing(false);
      zendeskCloseTimeout.current = null;
    }, 180);
  };

  const toggleMessageTrace = (index: number, anchor: HTMLElement | null) => {
    if (!anchor) return;
    if (metaOverlayCloseTimeout.current) {
      window.clearTimeout(metaOverlayCloseTimeout.current);
      metaOverlayCloseTimeout.current = null;
    }
    setIsMetaOverlayClosing(false);
    const anchorRect = anchor.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const modalMaxHeight = Math.min(viewportHeight * 0.6, 420);
    const spaceAbove = anchorRect.top - 24;
    const spaceBelow = viewportHeight - anchorRect.bottom - 24;
    const vertical =
      spaceBelow < modalMaxHeight && spaceAbove >= spaceBelow ? 'above' : 'below';
    setMessages((prev) => {
      if (!prev[index]) return prev;
      const next = [...prev];
      const message = next[index];
      const traceQueries = message.trace?.agentThinking?.queries ?? [];
      const collapsedTools = traceQueries.reduce<Record<string, boolean>>((acc, q) => {
        const label = q.tool.startsWith('vector_store_search_')
          ? q.tool.replace('vector_store_search_', '')
          : q.tool.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
        acc[label] = true;
        return acc;
      }, {});
      next[index] = { ...message, collapsedTools };
      return next;
    });
    setMetaOverlay({ type: 'trace', messageIndex: index, anchorRect, align: 'right', vertical });
  };

  const toggleMessageSources = (index: number, anchor: HTMLElement | null) => {
    if (!anchor) return;
    if (metaOverlayCloseTimeout.current) {
      window.clearTimeout(metaOverlayCloseTimeout.current);
      metaOverlayCloseTimeout.current = null;
    }
    setIsMetaOverlayClosing(false);
    const anchorRect = anchor.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const modalMaxHeight = Math.min(viewportHeight * 0.6, 420);
    const spaceAbove = anchorRect.top - 24;
    const spaceBelow = viewportHeight - anchorRect.bottom - 24;
    const vertical =
      spaceBelow < modalMaxHeight && spaceAbove >= spaceBelow ? 'above' : 'below';
    setMetaOverlay({ type: 'sources', messageIndex: index, anchorRect, align: 'left', vertical });
  };

  const toggleMessageToolCollapse = (index: number, label: string) => {
    setMessages((prev) => {
      if (!prev[index]) return prev;
      const next = [...prev];
      const message = next[index];
      const collapsedTools = { ...(message.collapsedTools ?? {}) };
      collapsedTools[label] = !(collapsedTools[label] ?? false);
      next[index] = { ...message, collapsedTools };
      return next;
    });
  };

  useEffect(() => {
    document.body.style.overflow = metaOverlay ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [metaOverlay]);

  useEffect(() => {
    return () => {
      if (dropdownAnimTimeout.current) {
        window.clearTimeout(dropdownAnimTimeout.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (zendeskCloseTimeout.current) {
        window.clearTimeout(zendeskCloseTimeout.current);
      }
      if (agentInterruptedCloseTimeout.current) {
        window.clearTimeout(agentInterruptedCloseTimeout.current);
      }
      if (abortConfirmCloseTimeout.current) {
        window.clearTimeout(abortConfirmCloseTimeout.current);
      }
      if (feedbackReminderCloseTimeout.current) {
        window.clearTimeout(feedbackReminderCloseTimeout.current);
      }
      if (metaOverlayCloseTimeout.current) {
        window.clearTimeout(metaOverlayCloseTimeout.current);
      }
      if (chatAppearTimeout.current) {
        window.clearTimeout(chatAppearTimeout.current);
      }
      if (returnHomeTimeout.current) {
        window.clearTimeout(returnHomeTimeout.current);
      }
    };
  }, []);

  useEffect(() => {
    const shouldHideHeader = showInitialLoader || isChatOverlayVisible;
    document.body.classList.toggle('george-header-hidden', shouldHideHeader);
    return () => {
      document.body.classList.remove('george-header-hidden');
    };
  }, [showInitialLoader, isChatOverlayVisible]);

  const closeMetaOverlay = () => {
    if (!metaOverlay) return;
    setIsMetaOverlayClosing(true);
    if (metaOverlayCloseTimeout.current) {
      window.clearTimeout(metaOverlayCloseTimeout.current);
    }
    metaOverlayCloseTimeout.current = window.setTimeout(() => {
      setMetaOverlay(null);
      setIsMetaOverlayClosing(false);
      metaOverlayCloseTimeout.current = null;
    }, 180);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const isChatRequest = isChatMode;
    runModeRef.current = isChatRequest ? 'chat' : 'initial';
    abortRequestedRef.current = false;
    setShowAbortConfirm(false);
    setMetaOverlay(null);
    setIsMetaOverlayClosing(false);
    traceBufferRef.current = {};
    setInitialStreamStarted(false);
    setError('');
    setZendeskNotFound(null);
    setAgentInterrupted(null);
    setStatusSteps([]);
    setActiveStatusId(null);
    setStatusDone(false);
    setHasResponse(true);
    setLoading(true);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    if (isChatRequest) {
      setSteps((prev) => ({ started: true, queryAnalysis: prev.queryAnalysis }));
      setIsChatOverlayVisible(true);
      // Reset only UI state (collapse trace/sources panels) but preserve historical data
      setMessages((prev) =>
        prev.map((message) =>
          message.role === 'assistant'
            ? {
                ...message,
                // Keep sources, trace, timing - these are historical data
                isTraceOpen: false,
                isSourcesOpen: false,
                collapsedTools: undefined
              }
            : message
        )
      );
    } else {
      setMessages([]);
      setSessionId(null);
      setSteps({ started: true });
      setIsChatOverlayVisible(false);
    }

    // Auto-detect ticket ID if input starts with #
    const canUseTicketMode = !isChatRequest;
    const trimmedInput = input.trim();
    const detectedIsZendeskTicket = canUseTicketMode && trimmedInput.startsWith('#');
    const cleanInput = detectedIsZendeskTicket ? trimmedInput.replace(/^#/, '') : trimmedInput;
    const userLabel = detectedIsZendeskTicket ? `Zendesk ticket #${cleanInput}` : trimmedInput;
    const fallbackLabel = attachments.length > 0 ? 'Sent an attachment.' : '';
    const messageLabel = userLabel || fallbackLabel;
    if (!messageLabel && isChatRequest) {
      setLoading(false);
      setIsChatOverlayVisible(false);
      return;
    }
    const shouldDeferMessages = detectedIsZendeskTicket && !isChatRequest;
    if (!shouldDeferMessages) {
      if (isChatRequest) {
        setMessages((prev) => [
          ...prev,
          createUserMessage(messageLabel),
          createAssistantMessage('')
        ]);
      } else {
        setMessages([
          createUserMessage(messageLabel),
          createAssistantMessage('')
        ]);
      }
    }
    setInput('');
    if (isChatRequest && attachments.length > 0) {
      setAttachments([]);
      setAttachmentError('');
      setIsDragActive(false);
      setRemovingAttachmentIds(new Set());
    }
    let agentInputPayload: AgentInputPayload | null = null;

    const startedAt = performance.now();
    const usageRecords: Array<{ source?: string; costUsd?: number }> = [];
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        router.replace('/login');
        return;
      }
      if (!isChatRequest && detectedIsZendeskTicket) {
        setStatusSteps([{ id: 'fetch_ticket', label: 'Fetching Zendesk ticket' }]);
        setActiveStatusId('fetch_ticket');
        const ticketResponse = await fetch(ticketFetchEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify({ ticketId: Number(cleanInput) }),
          signal: abortController.signal
        });
        let ticketFinalEvent: AgentInputPayload | null = null;
        await consumeSseResponse(ticketResponse, (eventType, data) => {
          if (eventType === 'status') {
            const stage = String(data?.stage || '');
            const message = String(data?.message || '');
            if (stage === 'llm_usage') {
              if (data?.data && typeof data.data === 'object') {
                usageRecords.push(data.data as { source?: string; costUsd?: number });
              }
              console.log('[llm_usage][ticket_fetch]', data?.data);
              return;
            }
            if (stage) {
              setStatusSteps([{ id: stage, label: message || stage }]);
              setActiveStatusId(stage);
            }
            return;
          }
          if (eventType === 'done') {
            ticketFinalEvent = (data?.output as AgentInputPayload) || null;
            return;
          }
          if (eventType === 'error') {
            const message = String(data?.message || 'Ticket fetch failed');
            const code = typeof data?.code === 'string' ? data.code : '';
            const err = new Error(message);
            if (code) {
              (err as { code?: string }).code = code;
            }
            throw err;
          }
        });
        if (ticketResponse.status === 401) {
          router.replace('/login');
          return;
        }
        if (!ticketResponse.ok) {
          throw new Error(`Ticket fetch failed with ${ticketResponse.status}`);
        }
        const ticketOutput = ticketFinalEvent as AgentInputPayload | null;
        const ticketMetadata = ticketOutput?.metadata;
        if (ticketMetadata && typeof ticketMetadata === 'object') {
          setSteps((prev) => ({
            ...prev,
            queryAnalysis: {
              metadata: ticketMetadata as Record<string, unknown>,
              isZendesk: true
            }
          }));
          traceBufferRef.current = {
            ...traceBufferRef.current,
            queryAnalysis: {
              metadata: ticketMetadata as Record<string, unknown>,
              isZendesk: true
            }
          };
        }
        agentInputPayload = ticketOutput;
        if (shouldDeferMessages) {
          setMessages([
            createUserMessage(messageLabel),
            createAssistantMessage('')
          ]);
        }
        setStatusSteps((prev) => {
          const exists = prev.some((step) => step.id === 'start');
          if (exists) return prev;
          return [...prev, { id: 'start', label: 'Starting agent run' }];
        });
        setActiveStatusId('start');
      } else if (!isChatRequest) {
        setStatusSteps([{ id: 'query_analysis', label: 'Running query analysis' }]);
        setActiveStatusId('query_analysis');
        if (attachments.length > 0) {
          logAttachmentSummary('pre-query-analysis');
        }
        const userEmailValue = userEmailTag.trim();
        const softwareValue = softwareTag.trim();
        const softwareVersionValue = softwareVersionTag.trim();
        const osValue = osTag.trim();
        const osVersionValue = osVersionTag.trim();
        const queryPayload: Record<string, unknown> = { query: cleanInput };
        if (userEmailValue) {
          queryPayload.user_email = userEmailValue;
        }
        if (softwareValue) {
          queryPayload.software = softwareValue;
        }
        if (softwareVersionValue) {
          queryPayload.software_version = softwareVersionValue;
        }
        if (osValue) {
          queryPayload.os = osValue;
        }
        if (osVersionValue) {
          queryPayload.os_version = osVersionValue;
        }
        const analysisResponse = await fetch(queryAnalysisEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify(queryPayload),
          signal: abortController.signal
        });
        let analysisFinalEvent: AgentInputPayload | null = null;
        await consumeSseResponse(analysisResponse, (eventType, data) => {
          if (eventType === 'status') {
            const stage = String(data?.stage || '');
            const message = String(data?.message || '');
            if (stage === 'llm_usage') {
              if (data?.data && typeof data.data === 'object') {
                usageRecords.push(data.data as { source?: string; costUsd?: number });
              }
              console.log('[llm_usage][query_analysis]', data?.data);
              return;
            }
            if (stage) {
              setStatusSteps([{ id: stage, label: message || stage }]);
              setActiveStatusId(stage);
            }
            return;
          }
          if (eventType === 'done') {
            analysisFinalEvent = (data?.output as AgentInputPayload) || null;
            console.log('[metadata][query_analysis]', analysisFinalEvent?.metadata);
            return;
          }
          if (eventType === 'error') {
            const message = String(data?.message || 'Query analysis failed');
            throw new Error(message);
          }
        });
        if (analysisResponse.status === 401) {
          router.replace('/login');
          return;
        }
        if (!analysisResponse.ok) {
          throw new Error(`Query analysis failed with ${analysisResponse.status}`);
        }
        const analysisOutput = analysisFinalEvent as AgentInputPayload | null;
        const analysisMetadata = analysisOutput?.metadata;
        if (analysisMetadata && typeof analysisMetadata === 'object') {
          setSteps((prev) => ({
            ...prev,
            queryAnalysis: {
              metadata: analysisMetadata as Record<string, unknown>,
              isZendesk: false
            }
          }));
          traceBufferRef.current = {
            ...traceBufferRef.current,
            queryAnalysis: {
              metadata: analysisMetadata as Record<string, unknown>,
              isZendesk: false
            }
          };
        }
        if (analysisOutput && attachments.length > 0) {
          const attachmentsPayload = attachments.map((attachment) => attachment.dataUrl);
          const conversation = Array.isArray(analysisOutput.conversation)
            ? analysisOutput.conversation.map((entry) =>
                entry && typeof entry === 'object' ? { ...entry } : entry
              )
            : [];
          if (conversation.length === 0) {
            conversation.push({ role: 'user', content: cleanInput, attachments: attachmentsPayload });
          } else {
            const lastIndex = conversation.length - 1;
            const last = conversation[lastIndex];
            conversation[lastIndex] =
              last && typeof last === 'object'
                ? { ...last, attachments: attachmentsPayload }
                : { role: 'user', content: cleanInput, attachments: attachmentsPayload };
          }
          agentInputPayload = { ...analysisOutput, conversation };
        } else {
          agentInputPayload = analysisOutput;
        }
        setStatusSteps((prev) => {
          const exists = prev.some((step) => step.id === 'start');
          if (exists) return prev;
          return [...prev, { id: 'start', label: 'Starting agent run' }];
        });
        setActiveStatusId('start');
      }

      if (!detectedIsZendeskTicket && attachments.length > 0) {
        logAttachmentSummary('pre-agent-run');
      }

      const response = await fetch(agentEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          input: cleanInput,
          isZendeskTicket: detectedIsZendeskTicket,
          agentInput: agentInputPayload ?? undefined,
          sessionId: sessionId || undefined,
          conversationId: conversationId || undefined,
          attachments: isChatRequest
            ? attachments.map((attachment) => attachment.dataUrl)
            : undefined
        }),
        signal: abortController.signal
      });
      const roundTripMs = Math.round(performance.now() - startedAt);

      if (response.status === 401) {
        router.replace('/login');
        return;
      }
      if (!response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Request failed with ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let rawText = '';
      let sawEvent = false;
      const upsertTraceQuery = (entry: {
        callId: string;
        tool: string;
        query?: string;
        filters?: unknown;
        sources?: string[];
        output?: unknown;
      }) => {
        const trace = traceBufferRef.current || {};
        const queries = trace.agentThinking?.queries ? [...trace.agentThinking.queries] : [];
        const existingIndex = queries.findIndex((q) => q.callId === entry.callId);
        if (existingIndex >= 0) {
          const existing = queries[existingIndex];
          queries[existingIndex] = {
            ...existing,
            tool: entry.tool || existing.tool,
            query: entry.query ?? existing.query,
            filters: entry.filters ?? existing.filters,
            sources: entry.sources ?? existing.sources,
            output: entry.output ?? existing.output
          };
        } else {
          queries.push({
            callId: entry.callId,
            tool: entry.tool,
            query: entry.query ?? '',
            filters: entry.filters,
            sources: entry.sources ?? [],
            output: entry.output
          });
        }
        traceBufferRef.current = {
          ...trace,
          agentThinking: { queries }
        };
      };

      const handleEvent = (eventType: string, data: Record<string, unknown>) => {
        sawEvent = true;
        if (eventType === 'status') {
          const stage = String(data?.stage || '');
          const message = String(data?.message || '');
          const eventData = data?.data as Record<string, unknown> | undefined;
          const normalizedStage = stage.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
          const label = message.trim() ? message : normalizedStage;

          if (stage === 'llm_usage') {
            const source = eventData && typeof eventData.source === 'string' ? eventData.source : '';
            if (eventData && typeof eventData === 'object') {
              usageRecords.push(eventData as { source?: string; costUsd?: number });
            }
            if (source === 'agent_run') {
              console.log('[llm_usage][agent]', eventData);
            } else {
              console.log('[llm_usage]', eventData);
            }
            return;
          }

          if (stage === 'timing') {
            console.log('[timing]', { message, data: eventData });
            return;
          }

          if (stage === 'attachments_error') {
            console.warn('[attachments][analysis_error_detail]', eventData);
            return;
          }

          // Handle query analysis / ticket fetch
          if (stage === 'query_analysis' && eventData?.metadata) {
            console.log('[metadata][query_analysis]', eventData.metadata);
            setSteps((prev) => ({
              ...prev,
              queryAnalysis: { metadata: eventData.metadata as Record<string, unknown>, isZendesk: false }
            }));
            traceBufferRef.current = {
              ...traceBufferRef.current,
              queryAnalysis: { metadata: eventData.metadata as Record<string, unknown>, isZendesk: false }
            };
          } else if (stage === 'fetch_ticket' && eventData?.metadata) {
            console.log('[metadata][fetch_ticket]', eventData.metadata);
            setSteps((prev) => ({
              ...prev,
              queryAnalysis: { metadata: eventData.metadata as Record<string, unknown>, isZendesk: true }
            }));
            traceBufferRef.current = {
              ...traceBufferRef.current,
              queryAnalysis: { metadata: eventData.metadata as Record<string, unknown>, isZendesk: true }
            };
          }
          
          // Handle attachments - accumulate totals across all attachment analysis events
          if (stage === 'attachments_analysis' && eventData) {
            const total = typeof eventData.total === 'number' ? eventData.total : 0;
            const cached = typeof eventData.cached === 'number' ? eventData.cached : 0;
            const analyzed = typeof eventData.analyzed === 'number' ? eventData.analyzed : 0;
            console.log('[attachments][analysis]', { total, cached, analyzed, eventData });
            if (total > 0) {
              setSteps((prev) => {
                const existing = prev.attachments || { total: 0, cached: 0, analyzed: 0 };
                return {
                  ...prev,
                  attachments: {
                    total: existing.total + total,
                    cached: existing.cached + cached,
                    analyzed: existing.analyzed + analyzed
                  }
                };
              });
              const existing = traceBufferRef.current.attachments || { total: 0, cached: 0, analyzed: 0 };
              traceBufferRef.current = {
                ...traceBufferRef.current,
                attachments: {
                  total: existing.total + total,
                  cached: existing.cached + cached,
                  analyzed: existing.analyzed + analyzed
                }
              };
            }
          }

          if (stage && stage !== 'starting_agent_run') {
            setStatusSteps((prev) => {
              const existing = prev.find((step) => step.id === stage);
              if (existing) {
                if (existing.label !== label) {
                  return prev.map((step) => (step.id === stage ? { ...step, label } : step));
                }
                return prev;
              }
              return [...prev, { id: stage, label }];
            });
            setActiveStatusId(stage);
            setStatusDone(false);
          }
          
          return;
        }
        if (eventType === 'agent_text') {
          const text = String(data?.text || '');
          if (text) {
            if (!isChatRequest) {
              setInitialStreamStarted(true);
            }
            if (isChatRequest) {
              setIsChatOverlayVisible(false);
            }
            setMessages((prev) => {
              if (prev.length === 0) {
                return [createAssistantMessage(text)];
              }
              const next = [...prev];
              for (let i = next.length - 1; i >= 0; i -= 1) {
                if (next[i].role === 'assistant') {
                  next[i] = { ...next[i], content: next[i].content + text };
                  return next;
                }
              }
              next.push(createAssistantMessage(text));
              return next;
            });
          }
          return;
        }
        if (eventType === 'agent_event') {
          const name = String(data?.name || '');
          const eventData = data?.data as Record<string, unknown> | undefined;
          
          // Track tool_use to get query and filters
          if (name === 'tool_use' && eventData?.tool && eventData?.input) {
            const toolName = String(eventData.tool);
            const callId = String(eventData.callId || '');
            console.log('[TOOL_USE]', { toolName, callId, input: eventData.input });
            
            if (callId && eventData.input && typeof eventData.input === 'object') {
              const input = eventData.input as Record<string, unknown>;
              
              // Handle vector store tools
              if (toolName.startsWith('vector_store_search_')) {
                const query = String(input.query || '');
                const filters = input.filters;
                
                if (query) {
                  setSteps((prev) => {
                    const queries = prev.agentThinking?.queries || [];
                    // Check if we already have this callId (unique per tool call)
                    const existing = queries.find((q) => q.callId === callId);
                    if (existing) {
                      existing.query = query;
                      existing.filters = filters;
                      return { ...prev, agentThinking: { queries: [...queries] } };
                    }
                    return {
                      ...prev,
                      agentThinking: {
                        queries: [...queries, { callId, tool: toolName, query, filters, sources: [], output: undefined }]
                      }
                    };
                  });
                  upsertTraceQuery({ callId, tool: toolName, query, filters, sources: [] });
                }
              } else {
                // Handle other tools (like SQL agent)
                // Extract a meaningful query/description from input
                let query = '';
                if (toolName === 'CheckUserHistory') {
                  const email = typeof input.user_email === 'string' ? input.user_email : '';
                  const limit = typeof input.limit === 'number' ? input.limit : undefined;
                  const ticketAvoid = typeof input.ticket_id_to_avoid === 'number' ? input.ticket_id_to_avoid : undefined;
                  const parts: string[] = [];
                  if (email) parts.push(`Email: ${email}`);
                  if (typeof limit === 'number') parts.push(`Limit: ${limit}`);
                  if (typeof ticketAvoid === 'number' && ticketAvoid > 0) {
                    parts.push(`Ignore: ${ticketAvoid}`);
                  }
                  query = parts.join(' • ') || 'User history lookup';
                } else if (toolName === 'GetTicketConversation') {
                  const ticketId = typeof input.ticket_id === 'number' ? input.ticket_id : '';
                  query = ticketId ? `Ticket ID: ${ticketId}` : 'Ticket conversation';
                } else if (input.input) {
                  // SQL agent uses "input" field
                  query = String(input.input);
                } else if (input.query) {
                  query = String(input.query);
                } else if (input.sql) {
                  query = String(input.sql);
                } else if (input.question) {
                  query = String(input.question);
                } else {
                  // Fallback: stringify the input (truncated)
                  const inputStr = JSON.stringify(input);
                  query = inputStr.length > 100 ? inputStr.substring(0, 100) + '...' : inputStr;
                }
                
                setSteps((prev) => {
                  const queries = prev.agentThinking?.queries || [];
                  // Check if we already have this callId (unique per tool call)
                  const existing = queries.find((q) => q.callId === callId);
                  if (existing) {
                    existing.query = query;
                    return { ...prev, agentThinking: { queries: [...queries] } };
                  }
                  return {
                    ...prev,
                    agentThinking: {
                      queries: [...queries, { callId, tool: toolName, query, filters: undefined, sources: [], output: undefined }]
                    }
                  };
                });
                upsertTraceQuery({ callId, tool: toolName, query, filters: undefined, sources: [] });
              }
            }
          }
          
          // Track tool_result to get sources
          if (name === 'tool_result' && eventData?.tool) {
            const toolName = String(eventData.tool);
            const callId = String(eventData.callId || '');
            console.log('[TOOL_RESULT]', { toolName, callId, hasOutput: !!eventData.output, hasSources: !!eventData.sources, output: eventData.output });
            if (toolName.toLowerCase().includes('sql')) {
              console.log('[SQL_OUTPUT]', { toolName, callId, output: eventData.output });
            }
            
            // Extract sources from eventData.sources (passed separately from server)
            const sourcesRaw = Array.isArray(eventData.sources) 
              ? eventData.sources.map((s: unknown) => String(s)).filter((url: string) => url.length > 0)
              : [];
            
            // Deduplicate sources by keeping only unique URLs
            const sources = Array.from(new Set(sourcesRaw));
            
            // Track all tools, not just vector store tools
            if (callId) {
              // Extract output from eventData
              let output: unknown = eventData.output;
              if (typeof output === 'string' && output.trim().startsWith('{') && !output.includes('... (truncated)')) {
                try {
                  output = JSON.parse(output);
                } catch {
                  // Keep original string if parsing fails.
                }
              }
              
              // Format output for display
              let outputDisplay: unknown = output;
              if (isTableOutput(output)) {
                outputDisplay = output;
              } else if (typeof output === 'string' && output.length > 500) {
                outputDisplay = output.substring(0, 500) + '... (truncated)';
              } else if (typeof output === 'object' && output !== null) {
                const jsonStr = JSON.stringify(output);
                if (jsonStr.length > 500) {
                  outputDisplay = jsonStr.substring(0, 500) + '... (truncated)';
                }
              }
              
              setSteps((prev) => {
                const queries = prev.agentThinking?.queries || [];
                // Match by callId to pair tool_result with tool_use
                const existing = queries.find((q) => q.callId === callId);
                if (existing) {
                  existing.sources = sources;
                  existing.output = outputDisplay;
                  return { ...prev, agentThinking: { queries: [...queries] } };
                }
                // If no existing entry, create one (for non-vector-store tools like SQL)
                return {
                  ...prev,
                  agentThinking: {
                    queries: [...queries, { callId, tool: toolName, query: '', filters: undefined, sources, output: outputDisplay }]
                  }
                };
              });
              upsertTraceQuery({ callId, tool: toolName, sources, output: outputDisplay });
            }
          }
          return;
        }
        if (eventType === 'done') {
          const outputText = String(data?.output || '');
          if (typeof data?.sessionId === 'string' && data.sessionId.trim()) {
            setSessionId(data.sessionId);
          }
          if (typeof data?.conversationId === 'string' && data.conversationId.trim()) {
            setConversationId(data.conversationId);
            // Refresh conversations list to show the new conversation
            refreshConversations();
          }
          if (usageRecords.length > 0) {
            const totalCostUsd = usageRecords.reduce((sum, record) => {
              const value = typeof record.costUsd === 'number' ? record.costUsd : 0;
              return sum + value;
            }, 0);
            const bySource = usageRecords.reduce<Record<string, number>>((acc, record) => {
              const source = typeof record.source === 'string' ? record.source : 'unknown';
              const value = typeof record.costUsd === 'number' ? record.costUsd : 0;
              acc[source] = (acc[source] || 0) + value;
              return acc;
            }, {});
            const timestamp = new Date().toISOString();
            const effectiveSessionId = (typeof data?.sessionId === 'string' && data.sessionId.trim()) ? data.sessionId : sessionId;
            const payload = {
              input: cleanInput,
              timestamp,
              totalCostUsd,
              bySource,
              sessionId: effectiveSessionId
            };
            console.log('[llm_usage][total]', payload);
            void fetch(costTrackerEndpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`
              },
              body: JSON.stringify(payload)
            }).catch((error) => {
              console.warn('[llm_usage][total] failed to persist', error);
            });
          }
          const meta = data && typeof data === 'object' ? (data as { meta?: { server_ms?: number } }).meta : undefined;
          const serverMs =
            typeof meta?.server_ms === 'number' ? Math.round(meta.server_ms) : undefined;
          const finalRoundTripMs = Math.round(performance.now() - startedAt);
          const serverTrace = data && typeof data === 'object' ? (data as { trace?: AgentTraceData }).trace : undefined;
          const mergedTrace = mergeTraceData(traceBufferRef.current, serverTrace);
          traceBufferRef.current = mergedTrace || traceBufferRef.current;
          const traceSnapshot = snapshotTraceData(mergedTrace);
          const sourcesFromServer = Array.isArray((data as { sources?: unknown }).sources)
            ? (data as { sources?: unknown }).sources as string[]
            : [];
          const sourcesForTrace = sourcesFromServer.length > 0
            ? Array.from(new Set(sourcesFromServer.map((s) => String(s)).filter((s) => s.length > 0)))
            : buildSourcesFromTrace(traceSnapshot);
          const timingInfo: TimingInfo = { round_trip_ms: finalRoundTripMs, server_ms: serverMs };
          const finalSessionId = typeof data?.sessionId === 'string' ? data.sessionId : sessionId;
          setMessages((prev) => {
            if (prev.length === 0) {
              const fresh = createAssistantMessage(outputText);
              return [
                {
                  ...fresh,
                  trace: traceSnapshot,
                  sources: sourcesForTrace.length > 0 ? sourcesForTrace : undefined,
                  timing: timingInfo,
                  feedbackReady: true,
                  originalSessionId: finalSessionId || undefined,
                  originalUserInput: cleanInput
                }
              ];
            }
            const next = [...prev];
            for (let i = next.length - 1; i >= 0; i -= 1) {
              if (next[i].role === 'assistant') {
                const content = outputText && !next[i].content ? outputText : next[i].content;
                next[i] = {
                  ...next[i],
                  content,
                  trace: traceSnapshot,
                  sources: sourcesForTrace.length > 0 ? sourcesForTrace : undefined,
                  timing: timingInfo,
                  feedbackReady: true,
                  originalSessionId: finalSessionId || next[i].originalSessionId,
                  originalUserInput: cleanInput || next[i].originalUserInput
                };
                return next;
              }
            }
            const fallback = createAssistantMessage(outputText);
            fallback.trace = traceSnapshot;
            fallback.sources = sourcesForTrace.length > 0 ? sourcesForTrace : undefined;
            fallback.timing = timingInfo;
            fallback.feedbackReady = true;
            fallback.originalSessionId = finalSessionId || undefined;
            fallback.originalUserInput = cleanInput;
            next.push(fallback);
            return next;
          });
          if (outputText && outputText.includes('Error analyzing the image')) {
            console.warn('[attachments][analysis_error]', {
              outputText,
              attachmentCount: attachments.length
            });
          }

          // Auto-log interaction to Supabase for feedback system
          if (finalSessionId && outputText) {
            const totalCostUsd = usageRecords.reduce((sum, record) => {
              const value = typeof record.costUsd === 'number' ? record.costUsd : 0;
              return sum + value;
            }, 0);
            const finalConversationId = typeof data?.conversationId === 'string' ? data.conversationId : conversationId;
            const interactionPayload = {
              session_id: finalSessionId,
              user_input: cleanInput,
              is_zendesk_ticket: detectedIsZendeskTicket,
              ticket_id: detectedIsZendeskTicket ? cleanInput : undefined,
              response_content: outputText,
              response_sources: sourcesForTrace.length > 0 ? sourcesForTrace : undefined,
              trace_data: traceSnapshot,
              timing_server_ms: serverMs,
              timing_roundtrip_ms: finalRoundTripMs,
              cost_usd: totalCostUsd > 0 ? totalCostUsd : undefined,
              attachments_count: attachments.length,
              conversation_id: finalConversationId || undefined
            };
            void fetch(agentInteractionsEndpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`
              },
              body: JSON.stringify(interactionPayload)
            }).then(async (res) => {
              if (res.ok) {
                const result = await res.json();
                if (result.id) {
                  // Update the last assistant message with the interaction ID and original data
                  setMessages((prev) => {
                    const next = [...prev];
                    for (let i = next.length - 1; i >= 0; i -= 1) {
                      if (next[i].role === 'assistant') {
                        next[i] = {
                          ...next[i],
                          interactionId: result.id,
                          originalSessionId: finalSessionId,
                          originalUserInput: cleanInput
                        };
                        return next;
                      }
                    }
                    return prev;
                  });
                }
              }
            }).catch((error) => {
              console.warn('[agent_interactions] failed to log interaction', error);
            });
          }

          setLoading(false);
          setStatusDone(true);
          setActiveStatusId(null);
          setIsChatOverlayVisible(false);
          return;
        }
        if (eventType === 'error') {
          const message = String(data?.message || 'Unknown error');
          setError(message);
          setLoading(false);
          setStatusDone(true);
          setActiveStatusId(null);
          setIsChatOverlayVisible(false);
        }
      };

      const parseEventBlock = (block: string) => {
        const lines = block.split('\n');
        let eventType = 'message';
        let dataStr = '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataStr += line.slice(5).trim();
          }
        }

        if (!dataStr) return;
        let data: Record<string, unknown> = {};
        try {
          data = JSON.parse(dataStr) as Record<string, unknown>;
        } catch {
          data = { text: dataStr };
        }
        handleEvent(eventType, data);
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        rawText += chunk;
        buffer += chunk;
        buffer = buffer.replace(/\r\n/g, '\n');
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          if (part.trim()) {
            parseEventBlock(part);
          }
        }
      }

      // Process any remaining buffer after stream ends
      if (buffer.trim()) {
        parseEventBlock(buffer);
      }

      // Only try to parse as JSON if we didn't see any SSE events AND the response looks like JSON
      if (!sawEvent && rawText.trim()) {
        // Check if it looks like SSE format (starts with "event:" or "data:")
        const looksLikeSSE = /^(event:|data:)/m.test(rawText);
        if (!looksLikeSSE) {
          try {
            const parsed = JSON.parse(rawText);
            if (typeof parsed?.sessionId === 'string' && parsed.sessionId.trim()) {
              setSessionId(parsed.sessionId);
            }
            const serverMs =
              typeof parsed?.meta?.server_ms === 'number' ? Math.round(parsed.meta.server_ms) : undefined;
            const traceSnapshot = snapshotTraceData(traceBufferRef.current);
            const sourcesForTrace = buildSourcesFromTrace(traceSnapshot);
            const timingInfo: TimingInfo = { round_trip_ms: roundTripMs, server_ms: serverMs };
            const outputText = parsed.output ? String(parsed.output) : '';
            setMessages((prev) => {
              if (prev.length === 0) {
                const fresh = createAssistantMessage(outputText);
                return [
                  {
                    ...fresh,
                    trace: traceSnapshot,
                    sources: sourcesForTrace.length > 0 ? sourcesForTrace : undefined,
                    timing: timingInfo
                  }
                ];
              }
              const next = [...prev];
              for (let i = next.length - 1; i >= 0; i -= 1) {
                if (next[i].role === 'assistant') {
                  next[i] = {
                    ...next[i],
                    content: outputText || next[i].content,
                    trace: traceSnapshot,
                    sources: sourcesForTrace.length > 0 ? sourcesForTrace : undefined,
                    timing: timingInfo
                  };
                  return next;
                }
              }
              const fallback = createAssistantMessage(outputText);
              fallback.trace = traceSnapshot;
              fallback.sources = sourcesForTrace.length > 0 ? sourcesForTrace : undefined;
              fallback.timing = timingInfo;
              next.push(fallback);
              return next;
            });
            if (!response.ok) {
              throw new Error(parsed.error || `Request failed with ${response.status}`);
            }
          } catch (parseError) {
            // If JSON parsing fails, it might be SSE that wasn't parsed correctly
            console.warn('Failed to parse response as JSON, might be SSE format:', parseError);
            setError('Failed to parse response. Received SSE format but no events were detected.');
          }
        } else {
          // It looks like SSE but we didn't parse any events - this is an error
          setError('Received SSE stream but failed to parse events.');
        }
      }
    } catch (err) {
      if (abortRequestedRef.current || (err instanceof DOMException && err.name === 'AbortError')) {
        return;
      }
      const message = err instanceof Error ? err.message : 'Unknown error';
      const code =
        err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : '';
      if (code === 'ZENDESK_TICKET_NOT_FOUND') {
        handleZendeskNotFound(message || 'Zendesk ticket not found.');
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
      setIsChatOverlayVisible(false);
    }
  };

  return (
    <div className="george-app">
      <div className="george-main-with-sidebar">
        <ConversationList
          conversations={conversations}
          activeConversationId={conversationId}
          onSelectConversation={handleSelectConversation}
          onSelectConversationById={handleSelectConversationById}
          onNewChat={requestNewChat}
          onDeleteConversation={handleDeleteConversation}
          onRenameConversation={handleRenameConversation}
          isLoading={conversationsLoading}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          onPrefetchConversation={handlePrefetchEnter}
          onCancelPrefetch={handlePrefetchLeave}
        />
        <div className="george-main-content">
      {/* Main Content */}
      {!hasResponse ? (
        <main className={`george-main${isReturningHome ? ' is-returning' : ''}`}>
          <div className="george-home-shell">
            <div className="george-hero">
              <div className="george-character-container">
                <img src="/george-logo.png" alt="George Character" className="george-character" />
              </div>
              <div className="george-greeting">
                {currentUserName && (
                  <p className="george-greeting-name">Hey {currentUserName}</p>
                )}
                <h2 className="george-greeting-title">How may I assist you today?</h2>
                <p className="george-greeting-text">
                  I'm George, your DxO support assistant. I speak fluent PhotoLab, PureRAW, and all matters of image excellence.
                </p>
              </div>
            </div>

            <div className={`george-input-container${showInput ? ' is-visible' : ' is-hidden'}`}>
              <div className="george-input-shell">
                {!isTicketMode && (attachments.length > 0 || attachmentError) ? (
                  <div className="george-attachments-panel">
                    {attachments.length > 0 ? (
                      <div className="george-attachments">
                        {attachments.map((attachment) => (
                          <div
                            key={attachment.id}
                            className={`george-attachment${
                              removingAttachmentIds.has(attachment.id) ? ' is-removing' : ''
                            }`}
                          >
                            <img
                              src={attachment.dataUrl}
                              alt={attachment.name}
                              className="george-attachment-thumb"
                            />
                            <button
                              type="button"
                              className="george-attachment-remove"
                              onClick={() => removeAttachment(attachment.id)}
                              aria-label={`Remove ${attachment.name}`}
                            >
                              x
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {attachmentError ? (
                      <div className="george-attachments-error">{attachmentError}</div>
                    ) : null}
                  </div>
                ) : null}
                <form
                  className={`george-input-form${isDragActive ? ' is-dragging' : ''}`}
                  onSubmit={handleSubmit}
                  onDragOver={handleAttachmentDragOver}
                  onDragLeave={handleAttachmentDragLeave}
                  onDrop={handleAttachmentDrop}
                >
                <div className="george-input-wrapper">
                  {ticketTag && (
                    <span className="george-ticket-tag">{ticketTag}</span>
                  )}
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      type="text"
                      className="george-input"
                      placeholder={ticketTag ? "" : "Ask a question or enter #ticket_id"}
                      value={inputAfterTag}
                      onKeyDown={(event) => {
                        if (event.key === 'Backspace' && ticketTag && inputAfterTag.length === 0) {
                          const nextTag = ticketTag.length > 2 ? ticketTag.slice(0, -1) : '';
                          setInput(nextTag);
                          setTicketError('');
                        }
                      }}
                      onChange={(event) => {
                        const newValue = event.target.value;
                        
                        // If we have a ticket tag, keep it and append what the user types.
                        if (ticketTag) {
                          if (newValue !== '' && !/^\d+$/.test(newValue)) {
                            setTicketError('Delete the ticket tag to type a message.');
                            setInput(ticketTag);
                            return;
                          }
                          setTicketError('');
                          setInput(ticketTag + newValue);
                        } else {
                          setTicketError('');
                          setInput(newValue);
                        }
                      }}
                      disabled={loading}
                    />
                    {ticketError && (
                      <div className="george-ticket-error">{ticketError}</div>
                    )}
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple={attachmentsRemaining > 1}
                  className="george-input-file"
                  onChange={handleAttachmentChange}
                  disabled={attachmentsDisabled}
                />
                <button
                  type="button"
                  className="george-input-attach"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={attachmentsDisabled}
                  aria-label={
                    isTicketMode
                      ? 'Attachments disabled for ticket lookup'
                      : attachmentsRemaining === 0
                        ? `Max allowed attachments: ${maxAttachments}`
                        : 'Add attachments'
                  }
                  title={attachmentsRemaining === 0 ? `Max allowed attachments: ${maxAttachments}` : undefined}
                >
                  <span aria-hidden="true">+</span>
                </button>
                <div className="george-input-info-wrap" data-open={infoOpen} ref={infoRef}>
                  <button
                    type="button"
                    className="george-input-info"
                    aria-label="Information"
                    aria-expanded={infoOpen}
                    aria-controls="george-info-popover"
                    onClick={() => setInfoOpen((open) => !open)}
                  >
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="2" />
                      <text x="10" y="10.5" textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="700" fill="currentColor">i</text>
                    </svg>
                  </button>
                  <div className="george-tooltip" role="tooltip">
                  <div className="george-tip-title">Choose your query method</div>
                  <div className="george-tip-row">
                    <span className="george-tip-kbd">#12345</span>
                    <div className="george-tip-stack">
                      <span className="george-tip-label">Ticket lookup</span>
                      <span className="george-tip-desc">Fetch a Zendesk ticket by ID</span>
                    </div>
                  </div>
                  <div className="george-tip-row">
                    <span className="george-tip-inline george-tip-inline-muted">Any text</span>
                    <div className="george-tip-stack">
                      <span className="george-tip-label">Direct question</span>
                      <span className="george-tip-desc">Ask a support question directly</span>
                      <span className="george-tip-desc">You can enrich the agent context by filling the optional fields for more accurate and personalized answers.</span>
                    </div>
                  </div>
                  </div>
                  <div
                    id="george-info-popover"
                    className="george-info-popover"
                    role="region"
                    aria-label="Query help"
                    aria-hidden={!infoOpen}
                  >
                  <div className="george-tip-title">Choose your query method</div>
                  <div className="george-tip-row">
                    <span className="george-tip-kbd">#12345</span>
                    <div className="george-tip-stack">
                      <span className="george-tip-label">Ticket lookup</span>
                      <span className="george-tip-desc">Fetch a Zendesk ticket by ID</span>
                    </div>
                  </div>
                  <div className="george-tip-row">
                    <span className="george-tip-inline george-tip-inline-muted">Any text</span>
                    <div className="george-tip-stack">
                      <span className="george-tip-label">Direct question</span>
                      <span className="george-tip-desc">Ask a support question directly</span>
                      <span className="george-tip-desc">You can enrich the agent context by filling the optional fields for more accurate and personalized answers.</span>
                    </div>
                  </div>
                  </div>
                </div>
                <button type="submit" className="george-input-send" disabled={loading} aria-label="Send">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M2 10L18 2L12 18L10 10L2 10Z" fill="currentColor"/>
                  </svg>
                </button>
                </form>
              </div>
              {!isTicketMode ? (
                <div className="george-inline-fields">
                  <div className="george-inline-field">
                    {userEmailTag ? (
                      <div
                        className="george-inline-tag george-inline-tag-email"
                        role="status"
                        aria-label="Email selected"
                      >
                        <span>{userEmailTag}</span>
                        <span
                          role="button"
                          tabIndex={0}
                          className="george-inline-tag-remove"
                          aria-label="Clear email"
                          onClick={(event) => {
                            event.stopPropagation();
                            setUserEmailDraft('');
                            setUserEmailTag('');
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setUserEmailDraft('');
                              setUserEmailTag('');
                            }
                          }}
                        >
                          ×
                        </span>
                      </div>
                    ) : (
                      <input
                          type="text"
                          className="george-inline-input"
                          placeholder="email"
                          size={Math.max(userEmailDraft.length, 6)}
                          value={userEmailDraft}
                          onChange={(event) => setUserEmailDraft(event.target.value)}
                          onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            const trimmed = userEmailDraft.trim();
                            if (!trimmed) return;
                            setUserEmailTag(trimmed);
                            setUserEmailDraft('');
                          }
                        }}
                        disabled={loading}
                      />
                    )}
                  </div>
                  <div className="george-inline-field">
                    {softwareTag ? (
                      <div
                        className="george-inline-tag george-inline-tag-muted"
                        role="status"
                        aria-label="Software selected"
                      >
                        <span>{softwareTag}</span>
                        <span
                          role="button"
                          tabIndex={0}
                          className="george-inline-tag-remove"
                          aria-label="Clear software"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSoftwareDraft('');
                            setSoftwareTag('');
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setSoftwareDraft('');
                              setSoftwareTag('');
                            }
                          }}
                        >
                          ×
                        </span>
                      </div>
                    ) : (
                        <div
                          className="george-inline-select"
                          id="george-software-field"
                          ref={softwareFieldRef}
                        >
                          <input
                            type="text"
                            className="george-inline-input george-inline-input-select"
                            placeholder="software"
                            size={Math.max(softwareDraft.length, 9)}
                            value={softwareDraft}
                            onFocus={() => openDropdownWith('software')}
                            onClick={() => openDropdownWith('software')}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              setSoftwareDraft(nextValue);
                              if (openDropdown !== 'software') {
                                openDropdownWith('software');
                              }
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                              }
                              if (event.key === 'Escape') {
                                closeDropdown();
                              }
                            }}
                            disabled={loading}
                          />
                          <button
                            type="button"
                            className="george-inline-select-toggle"
                            aria-label="Toggle software list"
                            onClick={() => {
                              if (openDropdown === 'software') {
                                closeDropdown();
                              } else {
                                openDropdownWith('software');
                              }
                            }}
                            disabled={loading}
                          >
                            <span aria-hidden="true">⌄</span>
                          </button>
                        </div>
                    )}
                  </div>
                  <div className="george-inline-field">
                    {softwareVersionTag ? (
                      <div
                        className="george-inline-tag george-inline-tag-muted"
                        role="status"
                        aria-label="Software version selected"
                      >
                        <span>{softwareVersionTag}</span>
                        <span
                          role="button"
                          tabIndex={0}
                          className="george-inline-tag-remove"
                          aria-label="Clear software version"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSoftwareVersionDraft('');
                            setSoftwareVersionTag('');
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setSoftwareVersionDraft('');
                              setSoftwareVersionTag('');
                            }
                          }}
                        >
                          ×
                        </span>
                      </div>
                    ) : (
                        <div
                          className="george-inline-select"
                          id="george-software-version-field"
                          ref={softwareVersionFieldRef}
                        >
                          <input
                            type="text"
                            className="george-inline-input george-inline-input-select"
                            placeholder="software version"
                            size={Math.max(softwareVersionDraft.length, 17)}
                            value={softwareVersionDraft}
                            onFocus={() => {
                              if (!softwareTag) {
                                flashInlineError('Please choose the software first.');
                                return;
                              }
                              openDropdownWith('softwareVersion');
                            }}
                            onClick={() => {
                              if (!softwareTag) {
                                flashInlineError('Please choose the software first.');
                                return;
                              }
                              openDropdownWith('softwareVersion');
                            }}
                            onChange={(event) => {
                              if (!softwareTag) {
                                flashInlineError('Please choose the software first.');
                                return;
                              }
                              const nextValue = event.target.value;
                              setSoftwareVersionDraft(nextValue);
                              if (openDropdown !== 'softwareVersion') {
                                openDropdownWith('softwareVersion');
                              }
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                              }
                              if (event.key === 'Escape') {
                                closeDropdown();
                              }
                            }}
                            disabled={loading}
                          />
                          <button
                            type="button"
                            className="george-inline-select-toggle"
                            aria-label="Toggle software version list"
                            onClick={() => {
                              if (!softwareTag) {
                                flashInlineError('Please choose the software first.');
                                return;
                              }
                              if (openDropdown === 'softwareVersion') {
                                closeDropdown();
                              } else {
                                openDropdownWith('softwareVersion');
                              }
                            }}
                            disabled={loading}
                          >
                            <span aria-hidden="true">⌄</span>
                          </button>
                        </div>
                    )}
                  </div>
                  <div className="george-inline-field">
                    {osTag ? (
                      <div
                        className="george-inline-tag george-inline-tag-muted"
                        role="status"
                        aria-label="OS selected"
                      >
                        <span>{osTag}</span>
                        <span
                          role="button"
                          tabIndex={0}
                          className="george-inline-tag-remove"
                          aria-label="Clear OS"
                          onClick={(event) => {
                            event.stopPropagation();
                            setOsDraft('');
                            setOsTag('');
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setOsDraft('');
                              setOsTag('');
                            }
                          }}
                        >
                          ×
                        </span>
                      </div>
                    ) : (
                        <div
                          className="george-inline-select"
                          id="george-os-field"
                          ref={osFieldRef}
                        >
                          <input
                            type="text"
                            className="george-inline-input george-inline-input-select"
                            placeholder="os"
                            size={Math.max(osDraft.length, 3)}
                            value={osDraft}
                            onFocus={() => openDropdownWith('os')}
                            onClick={() => openDropdownWith('os')}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              setOsDraft(nextValue);
                              if (openDropdown !== 'os') {
                                openDropdownWith('os');
                              }
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                              }
                              if (event.key === 'Escape') {
                                closeDropdown();
                              }
                            }}
                            disabled={loading}
                          />
                          <button
                            type="button"
                            className="george-inline-select-toggle"
                            aria-label="Toggle OS list"
                            onClick={() => {
                              if (openDropdown === 'os') {
                                closeDropdown();
                              } else {
                                openDropdownWith('os');
                              }
                            }}
                            disabled={loading}
                          >
                            <span aria-hidden="true">⌄</span>
                          </button>
                        </div>
                    )}
                  </div>
                  <div className="george-inline-field">
                    {osVersionTag ? (
                      <div
                        className="george-inline-tag george-inline-tag-muted"
                        role="status"
                        aria-label="OS version selected"
                      >
                        <span>{osVersionTag}</span>
                        <span
                          role="button"
                          tabIndex={0}
                          className="george-inline-tag-remove"
                          aria-label="Clear OS version"
                          onClick={(event) => {
                            event.stopPropagation();
                            setOsVersionDraft('');
                            setOsVersionTag('');
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setOsVersionDraft('');
                              setOsVersionTag('');
                            }
                          }}
                        >
                          ×
                        </span>
                      </div>
                    ) : (
                        <input
                          type="text"
                          className="george-inline-input"
                          placeholder="os version"
                          size={Math.max(osVersionDraft.length, 11)}
                          value={osVersionDraft}
                          onFocus={() => {
                            if (!osTag) {
                              flashInlineError('Please select the OS first.');
                              return;
                            }
                          }}
                          onClick={() => {
                            if (!osTag) {
                              flashInlineError('Please select the OS first.');
                              return;
                            }
                          }}
                          onChange={(event) => {
                            if (!osTag) {
                              flashInlineError('Please select the OS first.');
                              return;
                            }
                            setOsVersionDraft(event.target.value);
                          }}
                          onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            const trimmed = osVersionDraft.trim();
                            if (!trimmed) return;
                            setOsVersionTag(trimmed);
                            setOsVersionDraft('');
                          }
                        }}
                        disabled={loading}
                      />
                    )}
                  </div>
                  {inlineError ? <div className="george-inline-error">{inlineError}</div> : null}
                </div>
              ) : null}
            </div>
          </div>
          {dropdownReady && openDropdown && dropdownRect
            ? createPortal(
                <div
                  className={`george-inline-popover george-inline-popover-portal${dropdownPhase === 'closing' ? ' is-closing' : ''}`}
                  role="listbox"
                  ref={dropdownPortalRef}
                  style={{
                    position: 'fixed',
                    left: dropdownRect.left,
                    top: dropdownRect.top,
                    width: dropdownWidth ?? undefined
                  }}
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  {openDropdown === 'software'
                    ? filteredSoftwareOptions.length === 0
                      ? (
                          <div className="george-inline-popover-empty">No matches</div>
                        )
                      : filteredSoftwareOptions.map((option) => (
                          <button
                            key={option}
                            type="button"
                            className="george-inline-option"
                            onClick={() => {
                              setSoftwareTag(option);
                              setSoftwareDraft('');
                              closeDropdown();
                            }}
                          >
                            {option}
                          </button>
                        ))
                    : null}
                  {openDropdown === 'softwareVersion'
                    ? filteredSoftwareVersionOptions.length === 0
                      ? (
                          <div className="george-inline-popover-empty">No matches</div>
                        )
                      : filteredSoftwareVersionOptions.map((option) => (
                          <button
                            key={option}
                            type="button"
                            className="george-inline-option"
                            onClick={() => {
                              setSoftwareVersionTag(option);
                              setSoftwareVersionDraft('');
                              closeDropdown();
                            }}
                          >
                            {option}
                          </button>
                        ))
                    : null}
                  {openDropdown === 'os'
                    ? filteredOsOptions.length === 0
                      ? (
                          <div className="george-inline-popover-empty">No matches</div>
                        )
                      : filteredOsOptions.map((option) => (
                          <button
                            key={option}
                            type="button"
                            className="george-inline-option"
                            onClick={() => {
                              setOsTag(option);
                              setOsDraft('');
                              closeDropdown();
                            }}
                          >
                            {option}
                          </button>
                        ))
                    : null}
                </div>,
                document.body
              )
            : null}
        </main>
      ) : (
        <main className="george-main george-main-with-response">
          {error ? <p className="george-error">{error}</p> : null}
        {showInitialLoader ? (
            <section className="george-output">
                <div className="george-loading is-entering">
                  <div className="george-loading-logo">
                    <img src="/george-logo.png" alt="George thinking" />
                    <span className="george-loading-glow" aria-hidden="true" />
                  </div>
                  <button
                    type="button"
                    className="george-loading-abort"
                    onClick={requestAbort}
                    aria-label="Abort run"
                  >
                    <span className="george-loading-abort-icon" aria-hidden="true" />
                  </button>
                  <div className="george-loading-steps">
                    {(statusSteps.length > 0
                      ? statusSteps
                      : [{ id: 'start', label: 'Starting agent run', forceActive: true }]
                    ).map((step, index) => {
                      const isActive = 'forceActive' in step ? true : index === currentStatusIndex && !statusDone;
                      const isComplete = statusDone || index < currentStatusIndex;
                      const isThinkingStep = /thinking/i.test(step.label) || /thinking/i.test(step.id);
                      return (
                        <div
                          key={step.id}
                          ref={(node) => {
                            stepRefs.current[step.id] = node;
                          }}
                          className={`george-loading-step${isActive ? ' is-active' : ''}${isComplete ? ' is-complete' : ''}`}
                        >
                          <span className="george-loading-dot" aria-hidden="true" />
                          <span className="george-loading-text">
                            {step.label}
                            {isThinkingStep ? <span ref={thinkingRef} className="george-thinking-anchor" /> : null}
                          </span>
                          {isComplete ? (
                            <svg className="george-loading-check" viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ) : null}
                        </div>
                      );
                    })}
                    {steps.agentThinking && toolTags.length > 0 ? (
                      <div className="george-thinking-branches" ref={branchesRef}>
                        <svg className="george-thinking-arrows" aria-hidden="true">
                          {toolTags.map((label, index) => (
                            <path
                              key={`arrow-${label}`}
                              d={arrowPaths[index] || ''}
                              style={{ animationDelay: `${index * 0.12}s` }}
                            />
                          ))}
                        </svg>
                        <div className="george-thinking-tools" aria-label="Active tools">
                          {toolTags.map((label, index) => (
                            <div
                              key={label}
                              className="george-thinking-tool"
                              style={{
                                animationDelay: `${index * 0.12}s`,
                                left: `${toolTagPositions[index]?.left ?? 0}px`,
                                top: `${toolTagPositions[index]?.top ?? 0}px`
                              }}
                            >
                              {label}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
          </section>
        ) : null}
        <section className="george-output">
          <div className={`george-chat${showTranscript ? ' is-visible' : ''}`}>
              <div className={`george-chat-transcript${isLoadingConversation ? ' is-transitioning' : ''}`} ref={chatTranscriptRef}>
                {messages.map((message, index) => {
                  const trace = message.trace;
                  const traceQueries = trace?.agentThinking?.queries ?? [];
                  const hasSources = Boolean(message.sources && message.sources.length > 0);
                  const hasTrace = Boolean(message.timing || traceQueries.length > 0 || trace?.queryAnalysis);
                  const groupedTools = traceQueries.reduce<Record<string, typeof traceQueries>>((groups, q) => {
                    const label = q.tool.startsWith('vector_store_search_')
                      ? q.tool.replace('vector_store_search_', '')
                      : q.tool.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
                    if (!groups[label]) groups[label] = [];
                    groups[label].push(q);
                    return groups;
                  }, {});
                  return (
                    <div
                      key={`${message.role}-${index}`}
                      className={`george-chat-message ${message.role === 'user' ? 'is-user' : 'is-assistant'}`}
                      style={{ animationDelay: `${Math.min(index * 0.03, 0.3)}s` }}
                    >
                      <div className="george-chat-avatar" aria-hidden="true">
                        {message.role === 'assistant' ? (
                          <img src="/george-logo.png" alt="" />
                        ) : (
                          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path
                              d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5z"
                              fill="currentColor"
                            />
                          </svg>
                        )}
                      </div>
                      <div className="george-chat-bubble">
                        {message.role === 'assistant' ? (
                          <div
                            className="markdown"
                            dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(message.content) }}
                          />
                        ) : (
                          <div
                            className="george-chat-text"
                            dangerouslySetInnerHTML={{
                              __html: renderInlineMarkdown(escapeHtml(message.content)).replace(/\n/g, '<br />')
                            }}
                          />
                        )}
                      </div>
                      {message.role === 'assistant' && (hasSources || hasTrace || message.interactionId || message.feedbackReady) ? (
                        <div className="george-chat-meta">
                          {hasSources ? (
                            <button
                              type="button"
                              className="george-trace-toggle"
                              onClick={(event) => toggleMessageSources(index, event.currentTarget)}
                            >
                              Sources
                            </button>
                          ) : <span />}
                          {message.feedbackReady ? (
                            <FeedbackButtons
                              interactionId={message.interactionId ?? null}
                              currentRating={message.feedbackRating}
                              messageData={message.originalSessionId && message.originalUserInput ? {
                                sessionId: message.originalSessionId,
                                userInput: message.originalUserInput,
                                responseContent: message.content,
                                responseSources: message.sources,
                                traceData: message.trace,
                                timingServerMs: message.timing?.server_ms,
                                attachmentsCount: 0
                              } : undefined}
                              onFeedbackSubmit={(rating) => {
                                setMessages((prev) => {
                                  const next = [...prev];
                                  next[index] = { ...next[index], feedbackRating: rating };
                                  return next;
                                });
                              }}
                              onNewInteractionCreated={(newId) => {
                                setMessages((prev) => {
                                  const next = [...prev];
                                  next[index] = { ...next[index], interactionId: newId };
                                  return next;
                                });
                              }}
                            />
                          ) : null}
                          {hasTrace ? (
                            <button
                              type="button"
                              className="george-trace-toggle"
                              onClick={(event) => toggleMessageTrace(index, event.currentTarget)}
                            >
                              Trace · {typeof message.timing?.server_ms === 'number' ? `${(message.timing.server_ms / 1000).toFixed(2)}s` : 'n/a'}
                            </button>
                          ) : <span />}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className="george-input-container george-chat-input">
                <div className="george-input-shell">
                  {attachments.length > 0 || attachmentError ? (
                    <div className="george-attachments-panel">
                      {attachments.length > 0 ? (
                        <div className="george-attachments">
                          {attachments.map((attachment) => (
                            <div
                              key={attachment.id}
                              className={`george-attachment${
                                removingAttachmentIds.has(attachment.id) ? ' is-removing' : ''
                              }`}
                            >
                              <img
                                src={attachment.dataUrl}
                                alt={attachment.name}
                                className="george-attachment-thumb"
                              />
                              <button
                                type="button"
                                className="george-attachment-remove"
                                onClick={() => removeAttachment(attachment.id)}
                                aria-label={`Remove ${attachment.name}`}
                              >
                                x
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {attachmentError ? (
                        <div className="george-attachments-error">{attachmentError}</div>
                      ) : null}
                    </div>
                  ) : null}
                  <form
                    className={`george-input-form${isDragActive ? ' is-dragging' : ''}`}
                    onSubmit={handleSubmit}
                    onDragOver={handleAttachmentDragOver}
                    onDragLeave={handleAttachmentDragLeave}
                    onDrop={handleAttachmentDrop}
                  >
                    <div className="george-input-wrapper">
                      <input
                        type="text"
                        className="george-input"
                        placeholder="Send a message"
                        value={input}
                        onChange={(event) => {
                          setInput(event.target.value);
                        }}
                        disabled={loading}
                      />
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple={attachmentsRemaining > 1}
                      className="george-input-file"
                      onChange={handleAttachmentChange}
                      disabled={attachmentsDisabled}
                    />
                    <button
                      type="button"
                      className="george-input-attach"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={attachmentsDisabled}
                      aria-label={
                        attachmentsRemaining === 0
                          ? `Max allowed attachments: ${maxAttachments}`
                          : 'Add attachments'
                      }
                      title={attachmentsRemaining === 0 ? `Max allowed attachments: ${maxAttachments}` : undefined}
                    >
                      <span aria-hidden="true">+</span>
                    </button>
                    <button type="submit" className="george-input-send" disabled={loading} aria-label="Send">
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M2 10L18 2L12 18L10 10L2 10Z" fill="currentColor"/>
                      </svg>
                    </button>
                  </form>
                </div>
              </div>
              {isChatOverlayVisible ? (
                <div className="george-chat-overlay">
                  <div className="george-loading is-entering">
                    <div className="george-loading-logo">
                      <img src="/george-logo.png" alt="George thinking" />
                      <span className="george-loading-glow" aria-hidden="true" />
                    </div>
                    <button
                      type="button"
                      className="george-loading-abort"
                      onClick={requestAbort}
                      aria-label="Abort run"
                    >
                      <span className="george-loading-abort-icon" aria-hidden="true" />
                    </button>
                    <div className="george-loading-steps">
                      {(statusSteps.length > 0
                        ? statusSteps
                        : [{ id: 'start', label: 'Starting agent run', forceActive: true }]
                      ).map((step, index) => {
                        const isActive = 'forceActive' in step ? true : index === currentStatusIndex && !statusDone;
                        const isComplete = statusDone || index < currentStatusIndex;
                        const isThinkingStep = /thinking/i.test(step.label) || /thinking/i.test(step.id);
                        return (
                          <div
                            key={`overlay-${step.id}`}
                            ref={(node) => {
                              stepRefs.current[step.id] = node;
                            }}
                            className={`george-loading-step${isActive ? ' is-active' : ''}${isComplete ? ' is-complete' : ''}`}
                          >
                            <span className="george-loading-dot" aria-hidden="true" />
                            <span className="george-loading-text">
                              {step.label}
                              {isThinkingStep ? <span ref={thinkingRef} className="george-thinking-anchor" /> : null}
                            </span>
                            {isComplete ? (
                              <svg className="george-loading-check" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            ) : null}
                          </div>
                        );
                      })}
                      {steps.agentThinking && toolTags.length > 0 ? (
                        <div className="george-thinking-branches" ref={branchesRef}>
                          <svg className="george-thinking-arrows" aria-hidden="true">
                            {toolTags.map((label, index) => (
                              <path
                                key={`overlay-arrow-${label}`}
                                d={arrowPaths[index] || ''}
                                style={{ animationDelay: `${index * 0.12}s` }}
                              />
                            ))}
                          </svg>
                          <div className="george-thinking-tools" aria-label="Active tools">
                            {toolTags.map((label, index) => (
                              <div
                                key={`overlay-tool-${label}`}
                                className="george-thinking-tool"
                                style={{
                                  animationDelay: `${index * 0.12}s`,
                                  left: `${toolTagPositions[index]?.left ?? 0}px`,
                                  top: `${toolTagPositions[index]?.top ?? 0}px`
                                }}
                              >
                                {label}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
        </section>
        {conversationId && messages.length > 0 ? (
          <div className="george-conversation-feedback-container">
            <ConversationFeedback
              conversationId={conversationId}
              currentRating={currentConversation?.feedback_rating ?? null}
              currentComment={currentConversation?.feedback_comment ?? null}
              isHighlighted={showConversationFeedbackHighlight}
              isOpenExternal={isConversationFeedbackOpen}
              onOpenChange={setIsConversationFeedbackOpen}
              onSubmit={handleConversationFeedbackSubmit}
            />
          </div>
        ) : null}
    </main>
      )}
      {metaOverlay && messages[metaOverlay.messageIndex] ? createPortal(
        <div
          className={`george-meta-overlay${isMetaOverlayClosing ? ' is-closing' : ''}`}
          onClick={closeMetaOverlay}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="george-meta-anchor"
            style={{
              top:
                metaOverlay.vertical === 'above'
                  ? metaOverlay.anchorRect.top - 1
                  : metaOverlay.anchorRect.bottom + 1,
              left: metaOverlay.align === 'right' ? metaOverlay.anchorRect.right : metaOverlay.anchorRect.left,
              transform: (() => {
                const xShift = metaOverlay.align === 'right' ? 'translateX(-100%)' : '';
                const yShift = metaOverlay.vertical === 'above' ? 'translateY(-100%)' : '';
                if (xShift && yShift) return `${xShift} ${yShift}`;
                return xShift || yShift || 'none';
              })()
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`george-meta-modal${isMetaOverlayClosing ? ' is-closing' : ''}`}>
              <button
                type="button"
                className="george-meta-close"
                onClick={closeMetaOverlay}
                aria-label="Close"
              >
                ×
              </button>
              {(() => {
                const message = messages[metaOverlay.messageIndex];
                const trace = message.trace;
                const traceQueries = trace?.agentThinking?.queries ?? [];
                const groupedTools = traceQueries.reduce<Record<string, typeof traceQueries>>((groups, q) => {
                  const label = q.tool.startsWith('vector_store_search_')
                    ? q.tool.replace('vector_store_search_', '')
                    : q.tool.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
                  if (!groups[label]) groups[label] = [];
                  groups[label].push(q);
                  return groups;
                }, {});

                if (metaOverlay.type === 'sources') {
                  return (
                    <>
                      <div className="george-meta-title">Sources</div>
                      <div className="george-sources-list">
                        {(message.sources ?? []).map((url, sourceIndex) => (
                          <a
                            key={`${url}-${sourceIndex}`}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="george-source-item"
                          >
                            <span>{formatSourceLabel(url)}</span>
                            <span className="george-source-icon" aria-hidden="true">↗</span>
                          </a>
                        ))}
                      </div>
                    </>
                  );
                }

                return (
                  <>
                    <div className="george-meta-title">Trace</div>
                    {traceQueries.length > 0 ? (
                      <div className="george-trace-section">
                        <div className="george-trace-title">
                          <span className="george-trace-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24">
                              <path d="M14.7 6.3a4 4 0 1 0 3 3l-2.4-2.4-2.1 2.1-1.1-1.1 2.1-2.1-2.5-2.5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M10 14l-6.5 6.5a1.5 1.5 0 0 0 2.1 2.1L12 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                          Tools Used
                        </div>
                        <div className="george-trace-tools">
                          {Object.entries(groupedTools).map(([label, group]) => {
                            const isSqlTool = group.some((q) => isTableOutput(q.output));
                            const totalSources = group.reduce((sum, q) => sum + q.sources.length, 0);
                            const uniqueRows = (() => {
                              const seen = new Set<string>();
                              for (const q of group) {
                                if (isTableOutput(q.output)) {
                                  for (const row of q.output.rows) {
                                    seen.add(JSON.stringify(row));
                                  }
                                }
                              }
                              return seen.size;
                            })();
                            const isCollapsed = message.collapsedTools?.[label] ?? false;
                            return (
                              <div key={label} className="george-trace-tool">
                                <button
                                  type="button"
                                  className="george-trace-tool-header"
                                  onClick={() => toggleMessageToolCollapse(metaOverlay.messageIndex, label)}
                                >
                                  <span className="george-trace-tool-name">{label}</span>
                                  <span className="george-trace-tool-summary">
                                    {group.length} call{group.length !== 1 ? 's' : ''} • {isSqlTool ? `${uniqueRows} row${uniqueRows !== 1 ? 's' : ''}` : `${totalSources} source${totalSources !== 1 ? 's' : ''}`}
                                  </span>
                                  <span className={`george-trace-tool-chevron${isCollapsed ? '' : ' is-open'}`} aria-hidden="true">⌄</span>
                                </button>
                                {!isCollapsed ? (
                                  <div className="george-trace-tool-body">
                                    {group.map((q) => (
                                      <div key={q.callId} className="george-trace-tool-entry">
                                        {q.query ? <div className="george-trace-tool-desc">{q.query}</div> : null}
                                        {isTableOutput(q.output) ? (
                                          <div className="george-trace-tool-meta">
                                            <span>
                                              Found {q.output.row_count ?? q.output.rows.length} rows
                                              {q.query ? (() => {
                                                const tableName = extractSqlTableName(q.query);
                                                return tableName ? ` from ${tableName}` : '';
                                              })() : ''}
                                            </span>
                                            <div className="george-trace-table">
                                              <div className="george-trace-table-head">
                                                {q.output.columns.map((col, colIndex) => (
                                                  <span key={`${q.callId}-col-${colIndex}`}>{col}</span>
                                                ))}
                                              </div>
                                              {q.output.rows.map((row, rowIndex) => (
                                                <div key={`${q.callId}-row-${rowIndex}`} className="george-trace-table-row">
                                                  {row.map((cell, cellIndex) => (
                                                    <span key={`${q.callId}-cell-${rowIndex}-${cellIndex}`}>
                                                      {String(cell ?? '')}
                                                    </span>
                                                  ))}
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        ) : null}
                                        {!isTableOutput(q.output) && q.sources.length > 0 ? (
                                          <div className="george-trace-tool-meta">
                                            <span>Found {q.sources.length} relevant sources</span>
                                            <div className="george-trace-source-list">
                                              {q.sources.map((url, sourceIndex) => (
                                                <a
                                                  key={`${q.callId}-source-${sourceIndex}`}
                                                  href={url}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="george-trace-source"
                                                >
                                                  {formatSourceLabel(url)}
                                                </a>
                                              ))}
                                            </div>
                                          </div>
                                        ) : null}
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    <div className="george-trace-section">
                      <div className="george-trace-title">
                        <span className="george-trace-icon" aria-hidden="true">
                          <svg viewBox="0 0 24 24">
                            <path d="M12 6v6l4 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
                          </svg>
                        </span>
                        Response Time
                      </div>
                      <div className="george-trace-text">
                        {typeof message.timing?.server_ms === 'number' ? `${(message.timing.server_ms / 1000).toFixed(2)}s` : 'n/a'}
                      </div>
                    </div>

                    {trace?.queryAnalysis ? (
                      <div className="george-trace-section">
                        <div className="george-trace-title">
                          <span className="george-trace-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24">
                              <path d="M8 4h8l4 4v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M12 10h4M12 14h4M8 10h.01M8 14h.01" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                          Detected Metadata
                        </div>
                        <div className="george-trace-metadata">
                          <div>Category: <span>{String(trace.queryAnalysis.metadata.category || '—')}</span></div>
                          <div>Subcategory: <span>{String(trace.queryAnalysis.metadata.subcategory || '—')}</span></div>
                          <div>Software: <span>{String(trace.queryAnalysis.metadata.software || '—')}</span></div>
                          <div>Version: <span>{String(trace.queryAnalysis.metadata.software_version || '—')}</span></div>
                          <div>OS: <span>{String(trace.queryAnalysis.metadata.os || '—')}</span></div>
                          <div>OS Version: <span>{String(trace.queryAnalysis.metadata.os_version || '—')}</span></div>
                        </div>
                        {Array.isArray((trace.queryAnalysis.metadata as { missing_information?: unknown }).missing_information) &&
                        (trace.queryAnalysis.metadata as { missing_information?: unknown[] }).missing_information!.length > 0 ? (
                          <div className="george-trace-missing">
                            <span className="george-trace-icon" aria-hidden="true">
                              <svg viewBox="0 0 24 24">
                                <path d="M10.3 4.3a2 2 0 0 1 3.4 0l7.6 13.2a2 2 0 0 1-1.7 3H4.4a2 2 0 0 1-1.7-3z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M12 9v4M12 17h.01" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </span>
                            Missing:{' '}
                            {(trace.queryAnalysis.metadata as { missing_information?: unknown[] }).missing_information!
                              .map((item) => String(item))
                              .join(', ')}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                );
              })()}
            </div>
          </div>
        </div>,
        document.body
      ) : null}
      {zendeskNotFound ? createPortal(
        <div
          className={`george-alert-overlay${isZendeskNotFoundClosing ? ' is-closing' : ''}`}
          role="dialog"
          aria-modal="true"
          onClick={closeZendeskNotFound}
        >
          <div
            className={`george-alert-modal${isZendeskNotFoundClosing ? ' is-closing' : ''}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="george-alert-title">Zendesk ticket not found</div>
            <div className="george-alert-body">
              {zendeskNotFound || 'That Zendesk ticket ID does not exist.'}
            </div>
            <button type="button" className="george-alert-close" onClick={closeZendeskNotFound}>
              OK
            </button>
          </div>
        </div>,
        document.body
      ) : null}
      {agentInterrupted ? createPortal(
        <div
          className={`george-alert-overlay${isAgentInterruptedClosing ? ' is-closing' : ''}`}
          role="dialog"
          aria-modal="true"
          onClick={closeAgentInterrupted}
        >
          <div
            className={`george-alert-modal${isAgentInterruptedClosing ? ' is-closing' : ''}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="george-alert-title">Agent interrupted</div>
            <div className="george-alert-body">
              {agentInterrupted}
            </div>
            <button type="button" className="george-alert-close" onClick={closeAgentInterrupted}>
              OK
            </button>
          </div>
        </div>,
        document.body
      ) : null}
      {showAbortConfirm ? createPortal(
        <div
          className={`george-confirm-overlay${isAbortConfirmClosing ? ' is-closing' : ''}`}
          role="dialog"
          aria-modal="true"
          onClick={cancelAbort}
        >
          <div
            className={`george-confirm-modal${isAbortConfirmClosing ? ' is-closing' : ''}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="george-confirm-title">Interrupt this run?</div>
            <div className="george-confirm-body">
              Are you sure you want to interrupt the agent?
            </div>
            <div className="george-confirm-actions">
              <button type="button" className="george-confirm-cancel" onClick={cancelAbort}>
                Cancel
              </button>
              <button type="button" className="george-confirm-accept" onClick={confirmAbort}>
                Interrupt
              </button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}
      {showFeedbackReminder ? createPortal(
        <div
          className={`george-confirm-overlay${isFeedbackReminderClosing ? ' is-closing' : ''}`}
          role="dialog"
          aria-modal="true"
          onClick={closeFeedbackReminder}
        >
          <div
            className={`george-confirm-modal${isFeedbackReminderClosing ? ' is-closing' : ''}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="george-confirm-title">
              {currentConversation?.feedback_rating ? 'Is your feedback still accurate?' : 'Rate this conversation'}
            </div>
            <div className="george-confirm-body">
              {currentConversation?.feedback_rating ? (
                <>You previously rated this conversation. Would you like to update your feedback before starting a new conversation?</>
              ) : (
                <>Please consider rating this conversation before starting a new one. Your feedback helps us improve.</>
              )}
            </div>
            <div className="george-confirm-actions">
              <button type="button" className="george-confirm-cancel" onClick={skipFeedbackAndStartNewChat}>
                Skip
              </button>
              <button type="button" className="george-confirm-accept" onClick={closeFeedbackReminderAndOpenFeedback}>
                {currentConversation?.feedback_rating ? 'Update Feedback' : 'Rate Now'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}

        </div>
      </div>
    </div>
  );
}
