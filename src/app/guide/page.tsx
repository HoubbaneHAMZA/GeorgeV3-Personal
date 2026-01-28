'use client';

import { BookOpen } from 'lucide-react';

export default function GuidePage() {
  return (
    <div className="george-app">
      <main className="george-docs george-guide">
        <section className="george-docs-hero">
          <BookOpen size={48} className="george-docs-hero-icon" />
          <div>
            <h2>How to Use George</h2>
            <p>
              Learn how to get the most out of George, your AI-powered support assistant.
            </p>
          </div>
        </section>

        {/* Query Modes Section */}
        <section className="george-docs-section">
          <h3>Query Modes</h3>
          <p className="george-docs-note" style={{ marginBottom: '1.5rem' }}>
            George supports two modes of operation: Normal Query for general questions and Zendesk Ticket mode
            for loading and analyzing customer support tickets directly from Zendesk.
          </p>
          <div className="george-docs-cards">
            <div className="george-docs-card">
              <h4>Normal Query</h4>
              <p>
                Type your question directly and George will analyze it, extract relevant metadata,
                and search the knowledge base to provide accurate answers.
              </p>
              <ul style={{ marginTop: '0.75rem', paddingLeft: '1.25rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
                <li>Best for: General questions, research, learning</li>
                <li>Type your question as plain text</li>
                <li>Use optional fields (software, OS) for better results</li>
                <li>Responses are informative and detailed</li>
              </ul>
              <p style={{ marginTop: '0.75rem', fontSize: '0.9rem', color: 'var(--muted)' }}>
                <strong>Example:</strong> "How do I enable DeepPRIME XD in PhotoLab 8?"
              </p>
            </div>
            <div className="george-docs-card">
              <h4>Zendesk Ticket Mode</h4>
              <p>
                Start your input with <code style={{ background: 'var(--border)', padding: '2px 6px', borderRadius: '4px' }}>#</code> followed by a ticket number to fetch and analyze a Zendesk ticket.
                George will load the full ticket conversation, extract metadata, and provide a response
                tailored to the customer's issue.
              </p>
              <ul style={{ marginTop: '0.75rem', paddingLeft: '1.25rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
                <li>Best for: Responding to customer support tickets</li>
                <li>Automatically fetches ticket details from Zendesk</li>
                <li>Extracts software, OS, and issue context from the conversation</li>
                <li>Responses are formatted for customer communication</li>
              </ul>
              <p style={{ marginTop: '0.75rem', fontSize: '0.9rem', color: 'var(--muted)' }}>
                <strong>Example:</strong> <code style={{ background: 'var(--border)', padding: '2px 6px', borderRadius: '4px' }}>#123456</code> — fetches and analyzes Zendesk ticket 123456
              </p>
            </div>
            <div className="george-docs-card">
              <h4>How Zendesk Mode Works</h4>
              <p>
                When you enter a ticket ID with the # prefix:
              </p>
              <ol style={{ marginTop: '0.75rem', paddingLeft: '1.25rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
                <li>George fetches the full ticket conversation from Zendesk</li>
                <li>Metadata is automatically extracted (software, version, OS, issue type)</li>
                <li>The knowledge base is searched with the extracted context</li>
                <li>A customer-ready response is generated</li>
              </ol>
            </div>
            <div className="george-docs-card">
              <h4>When to Use Each Mode</h4>
              <div className="george-docs-grid" style={{ marginTop: '0.5rem' }}>
                <div>
                  <p className="george-docs-grid-title">Normal Query</p>
                  <p style={{ fontSize: '0.9rem' }}>
                    "What's new in PhotoLab 8?"<br />
                    "How does DeepPRIME work?"<br />
                    "Export settings for web"
                  </p>
                </div>
                <div>
                  <p className="george-docs-grid-title">Zendesk Ticket</p>
                  <p style={{ fontSize: '0.9rem' }}>
                    #123456<br />
                    #789012<br />
                    (any valid ticket ID)
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Ask George Section */}
        <section className="george-docs-section">
          <h3>Using the Chat</h3>
          <div className="george-docs-cards">
            <div className="george-docs-card">
              <h4>Starting a Conversation</h4>
              <p>
                Simply type your question in the chat input and press Enter or click the send button.
                George will analyze your query and search through DxO's knowledge base to provide
                accurate, relevant answers.
              </p>
            </div>
            <div className="george-docs-card">
              <h4>Conversation History</h4>
              <p>
                Your conversations are automatically saved. Use the sidebar to browse previous
                conversations, continue where you left off, or start a new conversation.
                Conversations can be renamed or archived for better organization.
              </p>
            </div>
            <div className="george-docs-card">
              <h4>Attaching Images</h4>
              <p>
                You can attach screenshots or images to your messages using the attachment button.
                George uses vision AI to analyze images and provide context-aware assistance for
                visual issues like error dialogs or UI problems.
              </p>
            </div>
          </div>
        </section>

        {/* Optional Fields Section */}
        <section className="george-docs-section">
          <h3>Optional Fields for Better Answers</h3>
          <p className="george-docs-note" style={{ marginBottom: '1.5rem' }}>
            Providing additional context helps George retrieve more accurate and relevant information.
            While optional, these fields significantly improve response quality.
          </p>
          <div className="george-docs-table">
            <div className="george-docs-table-head">
              <span>Field</span>
              <span>Why It Helps</span>
            </div>
            <div className="george-docs-table-row">
              <code>Email</code>
              <span>Enables George to search the customer's Zendesk ticket history for context about previous issues and interactions</span>
            </div>
            <div className="george-docs-table-row">
              <code>Software</code>
              <span>Filters results to the specific DxO product (PhotoLab, PureRAW, FilmPack, ViewPoint, Nik Collection)</span>
            </div>
            <div className="george-docs-table-row">
              <code>Software Version</code>
              <span>Ensures answers are relevant to your specific version, especially for version-specific features or bugs</span>
            </div>
            <div className="george-docs-table-row">
              <code>Operating System</code>
              <span>Many issues and workflows differ between Windows and macOS</span>
            </div>
            <div className="george-docs-table-row">
              <code>OS Version</code>
              <span>Some features and compatibility issues are specific to OS versions</span>
            </div>
          </div>
          <p className="george-docs-note" style={{ marginTop: '1rem' }}>
            Tip: The more specific you are about your environment, the more precise George's answers will be.
          </p>
        </section>

        {/* Feedback Section */}
        <section className="george-docs-section">
          <h3>Providing Feedback</h3>
          <div className="george-docs-cards">
            <div className="george-docs-card">
              <h4>Rating Responses</h4>
              <p>
                After each response, you can rate it as helpful (thumbs up) or not helpful (thumbs down).
                This feedback is crucial for improving George's accuracy and relevance over time.
              </p>
            </div>
            <div className="george-docs-card">
              <h4>Adding Tags</h4>
              <p>
                When providing feedback, you can select or create tags to categorize the issue.
                Common tags include "Incorrect information", "Outdated", "Missing context", or
                "Helpful". These tags help identify patterns for improvement.
              </p>
            </div>
            <div className="george-docs-card">
              <h4>Comments</h4>
              <p>
                Add detailed comments to explain why a response was helpful or what was missing.
                Specific feedback like "The steps were for an older version" helps us
                prioritize documentation updates.
              </p>
            </div>
            <div className="george-docs-card">
              <h4>How Feedback Helps</h4>
              <p>
                Your feedback directly improves George by:
              </p>
              <ul style={{ marginTop: '0.5rem', paddingLeft: '1.25rem', color: 'var(--muted)' }}>
                <li>Identifying gaps in documentation</li>
                <li>Highlighting outdated information</li>
                <li>Improving search relevance</li>
                <li>Training better response patterns</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Documentation Section */}
        <section className="george-docs-section">
          <h3>Documentation Page</h3>
          <div className="george-docs-cards">
            <div className="george-docs-card">
              <h4>Understanding Data Sources</h4>
              <p>
                The Documentation page shows all the knowledge sources George uses: User Guides,
                Release Notes, FAQ content, Macros, Website pages, and Confluence documentation.
                Each source serves a specific purpose in answering different types of questions.
              </p>
            </div>
            <div className="george-docs-card">
              <h4>Data Freshness</h4>
              <p>
                Check when each data source was last updated. George's knowledge is only as current
                as its data sources. If you notice outdated information, this helps identify which
                source needs updating.
              </p>
            </div>
            <div className="george-docs-card">
              <h4>How George Routes Queries</h4>
              <p>
                George classifies your question and routes it to the most relevant sources.
                Technical issues check Release Notes first (for known bugs/fixes), while
                marketing queries prioritize Website content. Understanding this helps you
                phrase questions for better results.
              </p>
            </div>
          </div>
        </section>

        {/* Analytics Section */}
        <section className="george-docs-section">
          <h3>Analytics Dashboard</h3>
          <div className="george-docs-cards">
            <div className="george-docs-card">
              <h4>Usage Metrics</h4>
              <p>
                Track how George is being used across the team: total conversations, messages,
                peak usage times, and response times. This helps understand adoption and
                identify opportunities for improvement.
              </p>
            </div>
            <div className="george-docs-card">
              <h4>Feedback Analytics</h4>
              <p>
                View aggregated feedback data: satisfaction rates, common tags, and trends over time.
                This highlights areas where George excels and where documentation or responses
                need improvement.
              </p>
            </div>
            <div className="george-docs-card">
              <h4>Cost Tracking</h4>
              <p>
                Monitor AI usage costs broken down by source (main assistant, SQL agent, vision model, etc.).
                This helps with resource planning and identifying optimization opportunities.
              </p>
            </div>
            <div className="george-docs-card">
              <h4>Exporting Data</h4>
              <p>
                Export conversation data and analytics for reporting or further analysis.
                Use filters to narrow down to specific time periods, users, or feedback types.
              </p>
            </div>
          </div>
        </section>

        {/* Tips Section */}
        <section className="george-docs-section">
          <h3>Tips for Best Results</h3>
          <div className="george-docs-list">
            <div className="george-docs-row">
              <div className="george-docs-row-main">
                <h4>Be Specific</h4>
                <p>
                  Instead of "PhotoLab is slow", try "PhotoLab 8 on macOS Sonoma takes 30 seconds to export a single RAW file".
                  Specific details help George find relevant solutions faster.
                </p>
              </div>
            </div>
            <div className="george-docs-row">
              <div className="george-docs-row-main">
                <h4>Include Error Messages</h4>
                <p>
                  If you see an error dialog or message, include the exact text or attach a screenshot.
                  Error codes and messages are often the fastest path to a solution.
                </p>
              </div>
            </div>
            <div className="george-docs-row">
              <div className="george-docs-row-main">
                <h4>One Topic Per Conversation</h4>
                <p>
                  For complex issues, start a new conversation for each distinct topic.
                  This keeps context focused and makes it easier to reference solutions later.
                </p>
              </div>
            </div>
            <div className="george-docs-row">
              <div className="george-docs-row-main">
                <h4>Use Follow-up Questions</h4>
                <p>
                  George maintains conversation context. If the first response doesn't fully address
                  your question, ask follow-up questions to drill down into specifics.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
