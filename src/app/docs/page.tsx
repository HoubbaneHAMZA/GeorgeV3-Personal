'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

const dataSources = [
  {
    name: 'QAI (FAQ + Solved Tickets)',
    description: 'Blended FAQ content and resolved Zendesk tickets for common questions and outcomes',
    format: 'HTML → Markdown + YAML',
    details: 'Combines official FAQ phrasing with real-world solved cases',
    storeKey: 'QAI'
  },
  {
    name: 'Macros',
    description: 'Pre-approved response templates',
    format: 'JSON → Markdown + YAML',
    details: 'Standardized phrasing for consistent support responses',
    storeKey: 'MACROS'
  },
  {
    name: 'Press Releases',
    description: 'Press releases and news',
    format: 'HTML → Markdown',
    details: 'Press releases and news',
    storeKey: 'PRESS_RELEASES'
  },
  {
    name: 'User Guides',
    description: 'Complete product documentation',
    format: 'PDF → Markdown',
    details: 'Primary how-to and workflow reference for technical questions',
    storeKey: 'USER_GUIDES'
  },
  {
    name: 'Release Notes',
    description: 'Version-specific changes and known issues',
    format: 'PDF → Markdown',
    details: 'First source checked for technical issues and recent fixes',
    storeKey: 'RELEASE_NOTES'
  },
  {
    name: 'Website Pages',
    description: 'Public product and marketing content',
    format: 'HTML → Markdown',
    details: 'Primary source for pre-purchase and product comparison queries',
    storeKey: 'WEBSITE'
  },
  {
    name: 'Confluence Pages',
    description: 'Internal technical documentation',
    format: 'XML → Markdown + YAML',
    details: 'Self-contained technical docs for edge cases',
    storeKey: 'CONFLUENCE'
  }
];

const vectorStores = [
  { name: 'WEBSITE', source: 'Website Pages' },
  { name: 'PRESS_RELEASES', source: 'Press Releases' },
  { name: 'MACROS', source: 'Macros' },
  { name: 'QAI', source: 'QAI (FAQ + Solved Tickets)' },
  { name: 'RELEASE_NOTES', source: 'Release Notes' },
  { name: 'USER_GUIDES', source: 'User Guides' },
  { name: 'CONFLUENCE', source: 'Confluence Pages' }
];

const filters = [
  { name: 'software', values: 'photolab, pureraw, filmpack, viewpoint, nik collection' },
  { name: 'software_version', values: 'Major versions only (e.g., 7, 8)' },
  { name: 'os', values: 'windows, macos' },
  { name: 'os_version', values: 'Version string (e.g., 10, 14.0)' },
  { name: 'language', values: 'en, fr, de' }
];

export default function DocsPage() {
  const [sourcesSnapshot, setSourcesSnapshot] = useState<Record<string, {
    lastUpdated: string | null;
    updatedFiles: Array<{ docId: string; docUpdatedAt: string | null }>;
  }> | null>(null);
  const [openUpdatedFor, setOpenUpdatedFor] = useState<string | null>(null);
  const [updatedModalClosing, setUpdatedModalClosing] = useState(false);
  const titleizeDocId = (value: string) => {
    if (!value) return 'Unknown doc';
    const stripped = value.replace(/\.[a-z0-9]+$/i, '');
    const normalized = stripped.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!normalized) return 'Unknown doc';
    return normalized
      .split(' ')
      .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
      .join(' ');
  };

  useEffect(() => {
    let mounted = true;
    supabase
      .from('dxo_vectorstore_snapshots')
      .select('vectorstore_key, last_updated, updated_files')
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error) {
          console.warn('[docs] failed to load vectorstore snapshots', error.message);
          return;
        }
        const next: Record<string, { lastUpdated: string | null; updatedFiles: Array<{ docId: string; docUpdatedAt: string | null }> }> = {};
        (data ?? []).forEach((row) => {
          const key = String(row.vectorstore_key || '').toLowerCase();
          if (!key) return;
          const updatedFiles = Array.isArray(row.updated_files)
            ? row.updated_files.map((item: { doc_id?: unknown; file_name?: unknown; doc_updated_at?: unknown }) => ({
                docId: String(item?.doc_id || item?.file_name || ''),
                docUpdatedAt: item?.doc_updated_at ? String(item.doc_updated_at) : null
              }))
            : [];
          next[key] = {
            lastUpdated: row.last_updated ? String(row.last_updated) : null,
            updatedFiles
          };
        });
        setSourcesSnapshot(next);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="george-app">
      <main className="george-docs">
        <section className="george-docs-hero">
          <img src="/george-logo.png" alt="George" className="george-docs-hero-logo" />
          <div>
            <h2>How George Works</h2>
            <p>
              George is a metadata-driven AI support agent that answers customer queries by consulting vector stores and
              databases — never using its own knowledge.
            </p>
          </div>
        </section>

        <section className="george-docs-section">
          <h3>Agent Strategy</h3>
          <div className="george-docs-cards">
            <div className="george-docs-card">
              <h4>1. Query Classification</h4>
              <p>
                George first classifies incoming queries into categories: <strong>General Greetings</strong> (answered
                directly), <strong>Camera/Lens Compatibility</strong> (SQL database query), or{' '}
                <strong>Product Questions</strong> (vector store search).
              </p>
            </div>
            <div className="george-docs-card">
              <h4>2. Metadata Routing</h4>
              <p>
                Product questions are further routed based on metadata extraction:
              </p>
              <div className="george-docs-grid">
                <div>
                  <p className="george-docs-grid-title">MARKETING Queries</p>
                  <p>
                    Pre-purchase, pricing, licensing, comparisons. Warm, benefits-first tone.
                  </p>
                </div>
                <div>
                  <p className="george-docs-grid-title">TECHNICAL Queries</p>
                  <p>
                    Bugs, crashes, workflow, installation. Professional, step-by-step tone.
                  </p>
                </div>
              </div>
            </div>
            <div className="george-docs-card">
              <h4>3. Tool Priority</h4>
              <p>
                Based on the query type, George searches vector stores in a specific order without repetition. For
                technical issues, Release Notes are checked first (known issues/fixes). For marketing queries, Website
                content is prioritized (product positioning).
              </p>
            </div>
            <div className="george-docs-card">
              <h4>4. Compatibility + Attachments</h4>
              <p>
                Camera and lens compatibility questions always use the SQL agent. If the user includes screenshots,
                images are analyzed in parallel with a vision model and their descriptions are appended to the query.
              </p>
            </div>
          </div>
        </section>

        <section className="george-docs-section">
          <h3>Data Sources</h3>
          <div className="george-docs-list">
            {dataSources.map((source) => (
              <div key={source.name} className="george-docs-row">
                <div className="george-docs-row-main">
                  <div className="george-docs-row-header">
                    <div className="george-docs-row-title">
                      <h4>{source.name}</h4>
                      <span className="george-docs-row-format">{source.format}</span>
                    </div>
                  </div>
                  <p>{source.description}</p>
                  <p className="george-docs-row-detail">{source.details}</p>
                </div>
                <div className="george-docs-row-meta">
                  <div className="george-docs-row-meta-title">Data status</div>
                  <div className="george-docs-row-meta-table">
                    {(() => {
                      const key = source.storeKey.toLowerCase();
                      const snapshot = sourcesSnapshot?.[key];
                      return (
                        <>
                          <div>
                            <span>Last updated</span>
                            <strong>
                              {snapshot?.lastUpdated
                                ? new Date(snapshot.lastUpdated).toLocaleString()
                                : '—'}
                            </strong>
                          </div>
                          <div>
                            <span>Owner</span>
                            <strong>Auto</strong>
                          </div>
                          <button
                            type="button"
                            className="george-docs-updated-btn"
                            onClick={() =>
                              setOpenUpdatedFor((prev) => (prev === key ? null : key))
                            }
                          >
                            Updated files ({snapshot?.updatedFiles?.length ?? 0})
                          </button>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {openUpdatedFor ? (
          <div
            className={`george-docs-overlay${updatedModalClosing ? ' is-closing' : ''}`}
            onClick={() => {
              if (updatedModalClosing) return;
              setUpdatedModalClosing(true);
              window.setTimeout(() => {
                setOpenUpdatedFor(null);
                setUpdatedModalClosing(false);
              }, 180);
            }}
          >
            <div
              className={`george-docs-modal${updatedModalClosing ? ' is-closing' : ''}`}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="george-docs-modal-close"
                onClick={() => {
                  if (updatedModalClosing) return;
                  setUpdatedModalClosing(true);
                  window.setTimeout(() => {
                    setOpenUpdatedFor(null);
                    setUpdatedModalClosing(false);
                  }, 180);
                }}
              >
                ×
              </button>
              <div className="george-docs-modal-title">Updated files</div>
              <div className="george-docs-modal-body">
                {(() => {
                  const files = [...(sourcesSnapshot?.[openUpdatedFor]?.updatedFiles ?? [])].sort((a, b) => {
                    const aTs = a.docUpdatedAt ? Date.parse(a.docUpdatedAt) : 0;
                    const bTs = b.docUpdatedAt ? Date.parse(b.docUpdatedAt) : 0;
                    return bTs - aTs;
                  });
                  if (files.length === 0) {
                    return <div className="george-docs-updated-empty">No new updates since last check.</div>;
                  }
                  return files.map((file) => (
                    <div key={`${file.docId}-${file.docUpdatedAt ?? ''}`} className="george-docs-updated-item">
                      <span className="george-docs-updated-name">{titleizeDocId(file.docId)}</span>
                      <span className="george-docs-updated-date">
                        {file.docUpdatedAt ? new Date(file.docUpdatedAt).toLocaleString() : '—'}
                      </span>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        ) : null}

        <section className="george-docs-section">
          <h3>Vector Stores</h3>
          <div className="george-docs-table">
            <div className="george-docs-table-head">
              <span>Store Name</span>
              <span>Data Source</span>
            </div>
            {vectorStores.map((store) => (
              <div key={store.name} className="george-docs-table-row">
                <code>{store.name}</code>
                <span>{store.source}</span>
              </div>
            ))}
          </div>
          <p className="george-docs-note">
            Each vector store is searched with metadata filters (software, OS, version, language, category) for precise
            retrieval. The tool returns top-3 excerpts (no separate summarizer model).
          </p>
        </section>

        <section className="george-docs-section">
          <h3>Metadata Filters</h3>
          <div className="george-docs-table">
            <div className="george-docs-table-head">
              <span>Filter</span>
              <span>Values</span>
            </div>
            {filters.map((filter) => (
              <div key={filter.name} className="george-docs-table-row">
                <code>{filter.name}</code>
                <span>{filter.values}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="george-docs-section">
          <h3>AI Models</h3>
          <div className="george-docs-models">
            <div className="george-docs-model">
              <p>Main Assistant</p>
              <code>gpt-5.2</code>
            </div>
            <div className="george-docs-model">
              <p>SQL Agent</p>
              <code>gpt-5.2</code>
            </div>
            <div className="george-docs-model">
              <p>Metadata Extractor</p>
              <code>gpt-4.1</code>
            </div>
            <div className="george-docs-model">
              <p>Attachment Vision</p>
              <code>gpt-5.1</code>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
