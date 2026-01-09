'use client';

const dataSources = [
  {
    name: 'Zendesk Tickets',
    description: 'Historical support conversations transformed into Q&A pairs',
    format: 'JSON → Markdown + YAML',
    details: 'Clustered by similarity to reduce redundancy and improve retrieval'
  },
  {
    name: 'Zendesk FAQ Articles',
    description: 'Official knowledge base articles',
    format: 'HTML → Markdown + YAML',
    details: 'Duplicated per applicable version for precise filtering'
  },
  {
    name: 'Zendesk Macros',
    description: 'Pre-approved response templates',
    format: 'JSON → Markdown + YAML',
    details: 'Multi-language support (EN/FR), separated per OS when applicable'
  },
  {
    name: 'User Guides',
    description: 'Complete product documentation',
    format: 'PDF → Markdown (Docling + GPU)',
    details: 'Expanded into separate Windows/macOS files for OS-specific results'
  },
  {
    name: 'Release Notes',
    description: 'Version-specific changes and known issues',
    format: 'PDF → Markdown (Docling)',
    details: 'First source checked for technical issues and recent fixes'
  },
  {
    name: 'Website Pages',
    description: 'Public product and marketing content',
    format: 'HTML → Markdown (Trafilatura)',
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
  { name: 'dxo_kb_faq', source: 'Zendesk FAQ Articles' },
  { name: 'dxo_kb_macro', source: 'Zendesk Macros' },
  { name: 'dxo_kb_release_notes', source: 'Release Notes' },
  { name: 'dxo_kb_user_guides', source: 'User Guides' },
  { name: 'dxo_kb_tickets', source: 'Zendesk Tickets' },
  { name: 'dxo_kb_website', source: 'Website Pages' },
  { name: 'dxo_kb_confluence', source: 'Confluence Pages' }
];

const filters = [
  { name: 'software', values: 'photolab, pureraw, filmpack, viewpoint, nikcollection' },
  { name: 'os', values: 'windows, macos, any' },
  { name: 'software_version', values: 'Version string (e.g., 7.0, 8.1)' },
  { name: 'language', values: 'en, fr, de, any' },
  { name: 'category', values: 'AI-assigned topic category' },
  { name: 'sub_category', values: 'AI-assigned topic subcategory' }
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
            retrieval. Results are summarized using GPT-4o-mini before being passed to the main agent.
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
              <code>gpt-4.1</code>
            </div>
            <div className="george-docs-model">
              <p>Summarizer</p>
              <code>gpt-4o-mini</code>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
