'use client';

import { useState, useRef, useEffect } from 'react';
import { RefreshCw, BrainCircuit, Upload } from 'lucide-react';
import { useDocsSnapshots } from '@/hooks/useDocsSnapshots';
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
  },
  {
    name: 'Cameras/Lenses Compatibility',
    description: 'Camera and lens compatibility data with DxO products',
    format: 'Excel → SQL Table (updated excel file at each CLSS)',
    details: 'cameras_curated and lenses_curated tables for hardware compatibility queries',
    storeKey: null,
    owner: 'Marie-Catherine Fargnoli'
  },
  {
    name: 'Software Compatibility',
    description: 'Software compatibility records (host apps, plugins, OS)',
    format: 'Excel → SQL Table (new version of the table at each software release)',
    details: 'compatibility_records table for software interoperability queries',
    storeKey: null,
    owner: 'Frédéric Baclet'
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

const ALLOWED_UPLOAD_EMAILS = [
  'mcfargnoli@dxo.com',
  'hhoubbane@dxo.com',
  'acalvi@dxo.com'
];

export default function DocsPage() {
  const { snapshots: sourcesSnapshot, refresh } = useDocsSnapshots();
  const [openUpdatedFor, setOpenUpdatedFor] = useState<string | null>(null);
  const [updatedModalClosing, setUpdatedModalClosing] = useState(false);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  // Excel upload state for Cameras/Lenses
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    cameras: number;
    lenses: number;
    camerasCurated: number;
    lensesCurated: number;
    updatedAt: string;
  } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Fetch current user email on mount
  useEffect(() => {
    const fetchUser = async () => {
      const { data } = await supabase.auth.getSession();
      setUserEmail(data.session?.user?.email ?? null);
    };
    fetchUser();
  }, []);

  // Fetch cameras/lenses metadata on mount
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const response = await fetch('/api/cameras-lenses-metadata');
        const data = await response.json();
        if (data.exists) {
          setUploadResult({
            cameras: data.cameras,
            lenses: data.lenses,
            camerasCurated: data.camerasCurated,
            lensesCurated: data.lensesCurated,
            updatedAt: data.updatedAt
          });
        }
      } catch (err) {
        console.error('Failed to fetch cameras/lenses metadata:', err);
      }
    };
    fetchMetadata();
  }, []);

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

  const handleRefresh = async () => {
    setIsManualRefreshing(true);
    await refresh();
    setIsManualRefreshing(false);
  };

  const handleExcelUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      // Get auth token for user identification
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload-cameras-lenses', {
        method: 'POST',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        setUploadResult({
          cameras: result.cameras,
          lenses: result.lenses,
          camerasCurated: result.camerasCurated,
          lensesCurated: result.lensesCurated,
          updatedAt: result.updatedAt
        });
        setUploadError(null);
      } else {
        setUploadError(result.error || 'Upload failed');
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="george-app">
      <main className="george-docs">
        <section className="george-docs-hero">
          <BrainCircuit size={48} className="george-docs-hero-icon" />
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
            <div className="george-docs-card">
              <h4>5. Long Ticket Summary</h4>
              <p>
                Long conversations are compacted before the run: older messages are summarized and injected so the
                agent keeps full context without exceeding the session limit.
              </p>
            </div>
          </div>
        </section>

        <section className="george-docs-section">
          <div className="george-docs-section-header">
            <h3>Data Sources</h3>
            <button
              type="button"
              className={`george-docs-refresh-btn${isManualRefreshing ? ' is-refreshing' : ''}`}
              onClick={handleRefresh}
              disabled={isManualRefreshing}
              title="Refresh data"
            >
              <RefreshCw size={16} className={isManualRefreshing ? 'spin' : ''} />
            </button>
          </div>
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
                      const key = source.storeKey
                        ? source.storeKey === 'MACROS' ? 'zendesk_macros' : source.storeKey.toLowerCase()
                        : null;
                      const snapshot = key ? sourcesSnapshot?.[key] : null;
                      return (
                        <>
                          <div>
                            <span>Last updated</span>
                            <strong>
                              {source.name === 'Cameras/Lenses Compatibility' && uploadResult?.updatedAt
                                ? new Date(uploadResult.updatedAt).toLocaleString()
                                : snapshot?.lastUpdated
                                  ? new Date(snapshot.lastUpdated).toLocaleString()
                                  : '—'}
                            </strong>
                          </div>
                          <div>
                            <span>Owner</span>
                            <strong>{source.owner || 'Auto'}</strong>
                          </div>
                          {key && (
                            <button
                              type="button"
                              className="george-docs-updated-btn"
                              onClick={() =>
                                setOpenUpdatedFor((prev) => (prev === key ? null : key))
                              }
                            >
                              Updated files ({snapshot?.updatedFiles?.length ?? 0})
                            </button>
                          )}
                          {source.name === 'Cameras/Lenses Compatibility' && (
                            <>
                              <input
                                type="file"
                                ref={fileInputRef}
                                accept=".xlsx,.xls"
                                onChange={handleExcelUpload}
                                style={{ display: 'none' }}
                              />
                              <div className="george-docs-upload-row">
                                <button
                                  type="button"
                                  className="george-docs-updated-btn george-docs-upload-btn"
                                  onClick={() => fileInputRef.current?.click()}
                                  disabled={isUploading || !userEmail || !ALLOWED_UPLOAD_EMAILS.includes(userEmail)}
                                >
                                  <Upload size={14} />
                                  {isUploading ? 'Uploading...' : 'Update Excel'}
                                </button>
                                {uploadResult && (
                                  <div className="george-docs-rows-tooltip-wrapper">
                                    <button
                                      type="button"
                                      className="george-docs-updated-btn george-docs-rows-btn"
                                    >
                                      Updated rows
                                    </button>
                                    <div className="george-docs-rows-tooltip">
                                      <table className="george-docs-upload-table">
                                        <thead>
                                          <tr>
                                            <th></th>
                                            <th>Cameras</th>
                                            <th>Lenses</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          <tr>
                                            <td>Raw</td>
                                            <td>{uploadResult.cameras}</td>
                                            <td>{uploadResult.lenses}</td>
                                          </tr>
                                          <tr>
                                            <td>Curated</td>
                                            <td>{uploadResult.camerasCurated}</td>
                                            <td>{uploadResult.lensesCurated}</td>
                                          </tr>
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                              </div>
                              {uploadError && (
                                <div className="george-docs-upload-error">{uploadError}</div>
                              )}
                            </>
                          )}
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
          <h3>SQL Tools</h3>
          <div className="george-docs-table">
            <div className="george-docs-table-head">
              <span>Tool Name</span>
              <span>Description</span>
            </div>
            <div className="george-docs-table-row">
              <code>cameras_lenses_compatibility_sql_tool</code>
              <span>Queries cameras_curated and lenses_curated tables for camera/lens compatibility with DxO products</span>
            </div>
            <div className="george-docs-table-row">
              <code>software_compatibility_sql_tool</code>
              <span>Queries compatibility_records table for software compatibility (host apps, plugins, OS)</span>
            </div>
          </div>
          <p className="george-docs-note">
            SQL tools use read-only SELECT queries with strict validation, row limits, and parameterized queries for safety.
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
              <code>gpt-5-mini</code>
            </div>
            <div className="george-docs-model">
              <p>Ticket Metadata Correction</p>
              <code>gpt-5-mini</code>
            </div>
            <div className="george-docs-model">
              <p>History Summary</p>
              <code>gpt-4.1-mini</code>
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
