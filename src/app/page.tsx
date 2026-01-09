'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

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

function renderInlineMarkdown(escaped: string) {
  // Code spans first so we don't parse markdown inside them.
  const withCode = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold then italic (simple/common cases).
  const withBold = withCode.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  const withItalic = withBold.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
  return withItalic;
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
  const agentEndpoint = '/api/agent';
  const queryAnalysisEndpoint = '/api/query-analysis';
  const ticketFetchEndpoint = '/api/ticket-fetch';
  const [input, setInput] = useState('');
  const [ticketError, setTicketError] = useState('');
  
  // Extract ticket number if input starts with # followed by numbers only
  const ticketMatch = input.match(/^(#\d+)(.*)$/);
  const ticketTag = ticketMatch ? ticketMatch[1] : null;
  const inputAfterTag = ticketMatch ? ticketMatch[2] : input;
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [timing, setTiming] = useState<TimingInfo | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const infoRef = useRef<HTMLDivElement | null>(null);
  const [steps, setSteps] = useState<{
    started: boolean;
    queryAnalysis?: { metadata: Record<string, unknown>; isZendesk: boolean };
    attachments?: { total: number; cached: number; analyzed: number };
    agentThinking?: { queries: Array<{ callId: string; tool: string; query: string; filters: unknown; sources: string[]; output?: unknown }> };
  }>({ started: false });
  const [statusSteps, setStatusSteps] = useState<Array<{ id: string; label: string }>>([]);
  const [activeStatusId, setActiveStatusId] = useState<string | null>(null);
  const [statusDone, setStatusDone] = useState(false);
  const [isTraceOpen, setIsTraceOpen] = useState(false);
  const [collapsedTools, setCollapsedTools] = useState<Record<string, boolean>>({});
  const [hasResponse, setHasResponse] = useState(false);
  const [logoToResponse, setLogoToResponse] = useState(false);
  const thinkingRef = useRef<HTMLSpanElement | null>(null);
  const branchesRef = useRef<HTMLDivElement | null>(null);
  const [arrowPaths, setArrowPaths] = useState<string[]>([]);
  const [toolTagPositions, setToolTagPositions] = useState<Array<{ left: number; top: number }>>([]);
  const stepRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const activeStatusIndex = activeStatusId
    ? statusSteps.findIndex((step) => step.id === activeStatusId)
    : -1;
  const currentStatusIndex =
    statusSteps.length === 0
      ? -1
      : statusDone
        ? statusSteps.length - 1
        : Math.max(activeStatusIndex, 0);
  const sources = Array.from(
    new Set(
      (steps.agentThinking?.queries || [])
        .flatMap((q) => q.sources || [])
        .filter((url) => url.length > 0)
    )
  );
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
  const showInput = !hasResponse;
  const showGeneratedBy = statusDone;
  const toolTags = Array.from(
    new Set(
      steps.agentThinking?.queries.map((q) =>
        q.tool.startsWith('vector_store_search_')
          ? q.tool.replace('vector_store_search_', '')
          : q.tool.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())
      ) || []
    )
  );

  const hashLabel = (label: string) => {
    let hash = 0;
    for (let i = 0; i < label.length; i += 1) {
      hash = (hash * 31 + label.charCodeAt(i)) % 100000;
    }
    return hash / 100000;
  };

  const getRectIntersection = (
    startX: number,
    startY: number,
    rect: { left: number; right: number; top: number; bottom: number }
  ) => {
    const centerX = (rect.left + rect.right) / 2;
    const centerY = (rect.top + rect.bottom) / 2;
    const dx = centerX - startX;
    const dy = centerY - startY;
    if (dx === 0 && dy === 0) return { x: centerX, y: centerY };
    const candidates: Array<{ t: number; x: number; y: number }> = [];
    if (dx !== 0) {
      const tLeft = (rect.left - startX) / dx;
      const yLeft = startY + tLeft * dy;
      if (tLeft > 0 && yLeft >= rect.top && yLeft <= rect.bottom) {
        candidates.push({ t: tLeft, x: rect.left, y: yLeft });
      }
      const tRight = (rect.right - startX) / dx;
      const yRight = startY + tRight * dy;
      if (tRight > 0 && yRight >= rect.top && yRight <= rect.bottom) {
        candidates.push({ t: tRight, x: rect.right, y: yRight });
      }
    }
    if (dy !== 0) {
      const tTop = (rect.top - startY) / dy;
      const xTop = startX + tTop * dx;
      if (tTop > 0 && xTop >= rect.left && xTop <= rect.right) {
        candidates.push({ t: tTop, x: xTop, y: rect.top });
      }
      const tBottom = (rect.bottom - startY) / dy;
      const xBottom = startX + tBottom * dx;
      if (tBottom > 0 && xBottom >= rect.left && xBottom <= rect.right) {
        candidates.push({ t: tBottom, x: xBottom, y: rect.bottom });
      }
    }
    if (candidates.length === 0) return { x: centerX, y: centerY };
    candidates.sort((a, b) => a.t - b.t);
    return { x: candidates[0].x, y: candidates[0].y };
  };

  const resetConversation = () => {
    setInput('');
    setTicketError('');
    setLoading(false);
    setOutput('');
    setError('');
    setTiming(null);
    setSteps({ started: false });
    setStatusSteps([]);
    setActiveStatusId(null);
    setStatusDone(false);
    setIsTraceOpen(false);
    setCollapsedTools({});
    setLogoToResponse(false);
    setHasResponse(false);
  };

  useEffect(() => {
    if (output) {
      setLogoToResponse(true);
    }
  }, [output]);

  useEffect(() => {
    if (!branchesRef.current || !thinkingRef.current) {
      setArrowPaths([]);
      setToolTagPositions([]);
      return;
    }
    const container = branchesRef.current;
    const anchor = thinkingRef.current;
    if (toolTags.length === 0) {
      setArrowPaths([]);
      setToolTagPositions([]);
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const startX = anchorRect.left + anchorRect.width / 2 - containerRect.left;
    const startY = anchorRect.top + anchorRect.height / 2 - containerRect.top;

    const width = Math.max(containerRect.width, 360);
    const baseY = startY + 70;
    const positions = toolTags.map((label, index) => {
      const seed = hashLabel(label);
      const angle = seed * Math.PI * 1.6 + index * 0.4;
      const radius = 110 + (seed * 60) + (index % 3) * 14;
      const left = width / 2 + Math.cos(angle) * radius;
      const top = baseY + Math.sin(angle) * 34 + (index % 2 ? 22 : -10);
      return {
        left: Math.max(32, Math.min(width - 32, left)),
        top: Math.max(baseY - 6, top),
        radius: Math.max(52, Math.min(140, 26 + label.length * 5.2))
      };
    });
    const relaxed = positions.map((pos) => ({ ...pos }));
    for (let iter = 0; iter < 26; iter += 1) {
      let moved = false;
      for (let i = 0; i < relaxed.length; i += 1) {
        for (let j = i + 1; j < relaxed.length; j += 1) {
          const dx = relaxed[j].left - relaxed[i].left;
          const dy = relaxed[j].top - relaxed[i].top;
          const dist = Math.hypot(dx, dy) || 1;
          const minDistance = relaxed[i].radius + relaxed[j].radius + 18;
          if (dist < minDistance) {
            const push = (minDistance - dist) / 2;
            const nx = dx / dist;
            const ny = dy / dist;
            relaxed[i].left -= nx * push;
            relaxed[i].top -= ny * push;
            relaxed[j].left += nx * push;
            relaxed[j].top += ny * push;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
    relaxed.forEach((pos) => {
      pos.left = Math.max(32, Math.min(width - 32, pos.left));
      pos.top = Math.max(baseY - 6, pos.top);
    });
    setToolTagPositions(relaxed.map(({ left, top }) => ({ left, top })));

    const computeArrows = () => {
      const nodes = Array.from(container.querySelectorAll<HTMLElement>('.george-thinking-tool'));
      if (nodes.length === 0) {
        setArrowPaths([]);
        return;
      }
      const paths = nodes.map((node, index) => {
        const rect = node.getBoundingClientRect();
        const end = getRectIntersection(startX + containerRect.left, startY + containerRect.top, rect);
        const endX = end.x - containerRect.left;
        const endY = end.y - containerRect.top;
        const midX = (startX + endX) / 2 + Math.cos(index * 1.3) * 28;
        const midY = (startY + endY) / 2 + Math.sin(index * 0.8) * 20;
        const ctrl1X = startX + (midX - startX) * 0.5;
        const ctrl1Y = startY + (midY - startY) * 0.5 - 10;
        const ctrl2X = endX - (endX - midX) * 0.5;
        const ctrl2Y = endY - (endY - midY) * 0.5 + 10;
        return `M ${startX} ${startY} C ${ctrl1X} ${ctrl1Y}, ${ctrl2X} ${ctrl2Y}, ${endX} ${endY}`;
      });
      setArrowPaths(paths);
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        computeArrows();
      });
    });
  }, [toolTags, statusSteps.length, activeStatusId]);

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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setOutput('');
    setTiming(null);
    setSteps({ started: true });
    setStatusSteps([]);
    setActiveStatusId(null);
    setStatusDone(false);
    setIsTraceOpen(false);
    setHasResponse(true);
    setLoading(true);

    // Auto-detect ticket ID if input starts with #
    const detectedIsZendeskTicket = input.trim().startsWith('#');
    const cleanInput = detectedIsZendeskTicket ? input.trim().replace(/^#/, '') : input;
    let agentInputPayload: AgentInputPayload | null = null;

    const startedAt = performance.now();
    try {
      if (detectedIsZendeskTicket) {
        setStatusSteps([{ id: 'fetch_ticket', label: 'Fetching Zendesk ticket' }]);
        setActiveStatusId('fetch_ticket');
        const ticketResponse = await fetch(ticketFetchEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketId: Number(cleanInput) })
        });
        let ticketOutput: AgentInputPayload | null = null;
        await consumeSseResponse(ticketResponse, (eventType, data) => {
          if (eventType === 'status') {
            const stage = String(data?.stage || '');
            const message = String(data?.message || '');
            if (stage) {
              setStatusSteps([{ id: stage, label: message || stage }]);
              setActiveStatusId(stage);
            }
            return;
          }
          if (eventType === 'done') {
            ticketOutput = (data?.output as { metadata?: unknown; conversation?: unknown }) || null;
            return;
          }
          if (eventType === 'error') {
            const message = String(data?.message || 'Ticket fetch failed');
            throw new Error(message);
          }
        });
        if (!ticketResponse.ok) {
          throw new Error(`Ticket fetch failed with ${ticketResponse.status}`);
        }
        agentInputPayload = ticketOutput;
        const ticketMetadata = agentInputPayload?.metadata;
        if (ticketMetadata && typeof ticketMetadata === 'object') {
          setSteps((prev) => ({
            ...prev,
            queryAnalysis: {
              metadata: ticketMetadata as Record<string, unknown>,
              isZendesk: true
            }
          }));
        }
        setStatusSteps((prev) => {
          const exists = prev.some((step) => step.id === 'start');
          if (exists) return prev;
          return [...prev, { id: 'start', label: 'Starting agent run' }];
        });
        setActiveStatusId('start');
      } else {
        setStatusSteps([{ id: 'query_analysis', label: 'Running query analysis' }]);
        setActiveStatusId('query_analysis');
        const analysisResponse = await fetch(queryAnalysisEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: cleanInput })
        });
        let analysisOutput: AgentInputPayload | null = null;
        await consumeSseResponse(analysisResponse, (eventType, data) => {
          if (eventType === 'status') {
            const stage = String(data?.stage || '');
            const message = String(data?.message || '');
            if (stage) {
              setStatusSteps([{ id: stage, label: message || stage }]);
              setActiveStatusId(stage);
            }
            return;
          }
          if (eventType === 'done') {
            analysisOutput = (data?.output as { metadata?: unknown; conversation?: unknown }) || null;
            return;
          }
          if (eventType === 'error') {
            const message = String(data?.message || 'Query analysis failed');
            throw new Error(message);
          }
        });
        if (!analysisResponse.ok) {
          throw new Error(`Query analysis failed with ${analysisResponse.status}`);
        }
        agentInputPayload = analysisOutput;
        const analysisMetadata = agentInputPayload?.metadata;
        if (analysisMetadata && typeof analysisMetadata === 'object') {
          setSteps((prev) => ({
            ...prev,
            queryAnalysis: {
              metadata: analysisMetadata as Record<string, unknown>,
              isZendesk: false
            }
          }));
        }
        setStatusSteps((prev) => {
          const exists = prev.some((step) => step.id === 'start');
          if (exists) return prev;
          return [...prev, { id: 'start', label: 'Starting agent run' }];
        });
        setActiveStatusId('start');
      }

      const response = await fetch(agentEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify({
          input: cleanInput,
          isZendeskTicket: detectedIsZendeskTicket,
          agentInput: agentInputPayload ?? undefined
        })
      });
      const roundTripMs = Math.round(performance.now() - startedAt);

      if (!response.body) {
        const data = await response.json().catch(() => ({}));
        const serverMs =
          typeof data?.meta?.server_ms === 'number' ? Math.round(data.meta.server_ms) : undefined;
        setTiming({ round_trip_ms: roundTripMs, server_ms: serverMs });
        throw new Error(data.error || `Request failed with ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let rawText = '';
      let sawEvent = false;

      const handleEvent = (eventType: string, data: Record<string, unknown>) => {
        sawEvent = true;
        if (eventType === 'status') {
          const stage = String(data?.stage || '');
          const message = String(data?.message || '');
          const eventData = data?.data as Record<string, unknown> | undefined;
          const normalizedStage = stage.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
          const label = message.trim() ? message : normalizedStage;

          // Handle query analysis / ticket fetch
          if (stage === 'query_analysis' && eventData?.metadata) {
            setSteps((prev) => ({
              ...prev,
              queryAnalysis: { metadata: eventData.metadata as Record<string, unknown>, isZendesk: false }
            }));
          } else if (stage === 'fetch_ticket' && eventData?.metadata) {
            setSteps((prev) => ({
              ...prev,
              queryAnalysis: { metadata: eventData.metadata as Record<string, unknown>, isZendesk: true }
            }));
          }
          
          // Handle attachments - accumulate totals across all attachment analysis events
          if (stage === 'attachments_analysis' && eventData) {
            const total = typeof eventData.total === 'number' ? eventData.total : 0;
            const cached = typeof eventData.cached === 'number' ? eventData.cached : 0;
            const analyzed = typeof eventData.analyzed === 'number' ? eventData.analyzed : 0;
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
            setOutput((prev) => prev + text);
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
                }
              } else {
                // Handle other tools (like SQL agent)
                // Extract a meaningful query/description from input
                let query = '';
                if (input.input) {
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
            }
          }
          return;
        }
        if (eventType === 'done') {
          const outputText = String(data?.output || '');
          if (outputText) {
            setOutput((prev) => (prev ? prev : outputText));
          }
          const serverMs =
            typeof data?.meta?.server_ms === 'number' ? Math.round(data.meta.server_ms) : undefined;
          const finalRoundTripMs = Math.round(performance.now() - startedAt);
          setTiming({ round_trip_ms: finalRoundTripMs, server_ms: serverMs });
          setLoading(false);
          setStatusDone(true);
          setActiveStatusId(null);
          return;
        }
        if (eventType === 'error') {
          const message = String(data?.message || 'Unknown error');
          setError(message);
          const serverMs =
            typeof data?.meta?.server_ms === 'number' ? Math.round(data.meta.server_ms) : undefined;
          const finalRoundTripMs = Math.round(performance.now() - startedAt);
          setTiming({ round_trip_ms: finalRoundTripMs, server_ms: serverMs });
          setLoading(false);
          setStatusDone(true);
          setActiveStatusId(null);
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
        setOutput(parsed.output || '');
        const serverMs =
          typeof parsed?.meta?.server_ms === 'number' ? Math.round(parsed.meta.server_ms) : undefined;
        setTiming({ round_trip_ms: roundTripMs, server_ms: serverMs });
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
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="george-app">
      {/* Main Content */}
      {!hasResponse ? (
        <main className="george-main">
          <div className="george-home-shell">
            <div className="george-hero">
              <div className="george-character-container">
                <img src="/george-logo.png" alt="George Character" className="george-character" />
              </div>
              <div className="george-greeting">
                <h2 className="george-greeting-title">How may I assist you today?</h2>
                <p className="george-greeting-text">
                  I'm George, your DxO support assistant. I speak fluent PhotoLab, PureRAW, and all matters of image excellence.
                </p>
              </div>
            </div>

            <div className={`george-input-container${showInput ? ' is-visible' : ' is-hidden'}`}>
              <form className="george-input-form" onSubmit={handleSubmit}>
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
          </div>
        </main>
      ) : (
        <main className="george-main george-main-with-response">
          {error ? <p className="george-error">{error}</p> : null}
        {steps.started ? (
            <section className="george-output">
              {!statusDone && output.length === 0 ? (
                <div className={`george-loading is-entering${output ? ' is-exiting' : ''}`}>
                  <div className="george-loading-logo">
                    <img src="/george-logo.png" alt="George thinking" />
                    <span className="george-loading-glow" aria-hidden="true" />
                  </div>
                  <div className="george-loading-steps">
                    {(statusSteps.length > 0
                      ? statusSteps
                      : [{ id: 'start', label: 'Starting agent run', forceActive: true }]
                    ).map((step, index) => {
                      const isActive = step.forceActive ? true : index === currentStatusIndex && !statusDone;
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
                          {arrowPaths.map((path, index) => (
                            <path
                              key={`arrow-${index}`}
                              d={path}
                              style={{ animationDelay: `${index * 0.12}s` }}
                            />
                          ))}
                        </svg>
                        <div className="george-thinking-tools" aria-label="Active tools">
                          {toolTags.map((label, index) => (
                            <div
                              key={`${label}-${index}`}
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
              ) : null}
          </section>
        ) : null}
        {output ? (
            <section className="george-output">
            <div className={`george-response${logoToResponse ? ' is-streaming' : ''}`}>
              <div className="george-response-header">
                <img
                  src="/george-logo.png"
                  alt="George"
                  className={`george-response-logo${logoToResponse ? ' is-entered' : ''}`}
                />
                <div
                  className="markdown"
                  dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(output) }}
                />
              </div>
            </div>
            {sources.length > 0 ? (
              <div className="george-sources">
                <p className="george-sources-title">Sources</p>
                <div className="george-sources-list">
                  {sources.map((url, index) => (
                    <a
                      key={`${url}-${index}`}
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
              </div>
            ) : null}
            {statusDone ? (
              <div className="george-input-container">
                <div className="george-generated-by">Generated By Mr George</div>
              </div>
            ) : null}
            {statusDone ? (
              <div className="george-trace">
                <button
                  type="button"
                  className="george-trace-toggle"
                  onClick={() => setIsTraceOpen((open) => !open)}
                >
                  <span className={`george-trace-chevron${isTraceOpen ? ' is-open' : ''}`} aria-hidden="true">⌄</span>
                  Trace · {typeof timing?.server_ms === 'number' ? `${(timing.server_ms / 1000).toFixed(2)}s` : 'n/a'}
                </button>
                {isTraceOpen ? (
                  <div className="george-trace-panel">
                    {steps.agentThinking && steps.agentThinking.queries.length > 0 ? (
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
                          {Object.entries(
                            steps.agentThinking.queries.reduce<Record<string, typeof steps.agentThinking.queries>>(
                              (groups, q) => {
                                const label = q.tool.startsWith('vector_store_search_')
                                  ? q.tool.replace('vector_store_search_', '')
                                  : q.tool.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase());
                                if (!groups[label]) groups[label] = [];
                                groups[label].push(q);
                                return groups;
                              },
                              {}
                            )
                          ).map(([label, group]) => {
                            const totalSources = group.reduce((sum, q) => sum + q.sources.length, 0);
                            const isCollapsed = collapsedTools[label] ?? false;
                            return (
                              <div key={label} className="george-trace-tool">
                                <button
                                  type="button"
                                  className="george-trace-tool-header"
                                  onClick={() =>
                                    setCollapsedTools((prev) => ({ ...prev, [label]: !isCollapsed }))
                                  }
                                >
                                  <span className="george-trace-tool-name">{label}</span>
                                  <span className="george-trace-tool-summary">
                                    {group.length} call{group.length !== 1 ? 's' : ''} • {totalSources} source{totalSources !== 1 ? 's' : ''}
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
                        {typeof timing?.server_ms === 'number' ? `${(timing.server_ms / 1000).toFixed(2)}s` : 'n/a'}
                      </div>
                    </div>

                    {steps.queryAnalysis ? (
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
                          <div>Category: <span>{String(steps.queryAnalysis.metadata.category || '—')}</span></div>
                          <div>Subcategory: <span>{String(steps.queryAnalysis.metadata.subcategory || '—')}</span></div>
                          <div>Software: <span>{String(steps.queryAnalysis.metadata.software || '—')}</span></div>
                          <div>Version: <span>{String(steps.queryAnalysis.metadata.software_version || '—')}</span></div>
                          <div>OS: <span>{String(steps.queryAnalysis.metadata.os || '—')}</span></div>
                          <div>OS Version: <span>{String(steps.queryAnalysis.metadata.os_version || '—')}</span></div>
                        </div>
                        {Array.isArray((steps.queryAnalysis.metadata as { missing_information?: unknown }).missing_information) &&
                        (steps.queryAnalysis.metadata as { missing_information?: unknown[] }).missing_information!.length > 0 ? (
                          <div className="george-trace-missing">
                            <span className="george-trace-icon" aria-hidden="true">
                              <svg viewBox="0 0 24 24">
                                <path d="M10.3 4.3a2 2 0 0 1 3.4 0l7.6 13.2a2 2 0 0 1-1.7 3H4.4a2 2 0 0 1-1.7-3z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M12 9v4M12 17h.01" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </span>
                            Missing:{' '}
                            {(steps.queryAnalysis.metadata as { missing_information?: unknown[] }).missing_information!
                              .map((item) => String(item))
                              .join(', ')}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}
    </main>
      )}

    </div>
  );
}
