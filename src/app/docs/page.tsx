'use client';

const dataSources = [
  {
    name: 'QAI (FAQ + Solved Tickets)',
    description: 'Blended FAQ content and resolved Zendesk tickets for common questions and outcomes',
    format: 'HTML → Markdown + YAML',
    details: 'Combines official FAQ phrasing with real-world solved cases'
  },
  {
    name: 'Macros',
    description: 'Pre-approved response templates',
    format: 'JSON → Markdown + YAML',
    details: 'Standardized phrasing for consistent support responses'
  },
  {
    name: 'User Guides',
    description: 'Complete product documentation',
    format: 'PDF → Markdown',
    details: 'Primary how-to and workflow reference for technical questions'
  },
  {
    name: 'Release Notes',
    description: 'Version-specific changes and known issues',
    format: 'PDF → Markdown',
    details: 'First source checked for technical issues and recent fixes'
  },
  {
    name: 'Website Pages',
    description: 'Public product and marketing content',
    format: 'HTML → Markdown',
    details: 'Primary source for pre-purchase and product comparison queries'
  },
  {
    name: 'Confluence Pages',
    description: 'Internal technical documentation',
    format: 'XML → Markdown + YAML',
    details: 'Self-contained technical docs for edge cases'
  }
];

const vectorStores = [
  { name: 'WEBSITE', source: 'Website Pages' },
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
                <div className="george-docs-row-header">
                  <h4>{source.name}</h4>
                  <span>{source.format}</span>
                </div>
                <p>{source.description}</p>
                <p className="george-docs-row-detail">{source.details}</p>
              </div>
            ))}
          </div>
        </section>

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
              <code>gpt-4o-mini</code>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
