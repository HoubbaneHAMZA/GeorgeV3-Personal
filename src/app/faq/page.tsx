'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import yaml from 'yaml';

// Metadata item structure from applicable_combinations (supports both formats)
interface MetadataItem {
  os: string;
  software: string;
  // Old format (arrays)
  os_versions?: string[];
  software_versions?: string[];
  // New format (singular)
  os_version?: string;
  software_version?: string;
}

// Parsed QAI content structure
interface QAIContent {
  title: string;
  question: string;
  answer: string;
  category?: string;
  sub_category?: string;
  language?: string;
  intervention_type?: string;
  intervention_detail?: string;
  applicable_combinations?: MetadataItem[];
  source_faq_ids?: string[];
  source_ticket_ids?: string[];
  cluster_id?: number;
}

// QAI record from dxo_qai_content_hashes table
interface QAIRecord {
  doc_id: string;
  exact_content: string | null;
  cluster_id: string | null;
  faq_ids: string[] | null;
  ticket_ids: string[] | null;
  faq_count: number;
  ticket_count: number;
  created_at: string;
  applicable_combinations: MetadataItem[] | null;
}

// Edit form state
interface EditFormState {
  title: string;
  question: string;
  answer: string;
  category: string;
  sub_category: string;
  intervention_type: string;
  intervention_detail: string;
}

// Job status from the edge function
interface JobStatus {
  job_id: string;
  status: 'processing' | 'completed' | 'failed';
  started_at: string;
  completed_at: string | null;
  result: {
    success: boolean;
    message: string;
    old_expanded_count?: number;
    new_expanded_count?: number;
    deleted_files?: number;
    uploaded_files?: number;
    errors?: string[];
  } | null;
}

// Edge function configuration
const EDGE_FUNCTION_URL = 'https://oqwokjqdjybzoajpbqtq.supabase.co/functions/v1/qai-update';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://oqwokjqdjybzoajpbqtq.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Category and Sub-category mapping (normalized from production data)
const CATEGORY_SUBCATEGORY_MAP: Record<string, string[]> = {
  'Account & Profile': [
    'Login & Password',
    'Account deletion',
    'Newsletter & Email subscriptions',
    'Customer account',
    'Premium Support',
  ],
  'Licensing & Activation': [
    'Activation errors',
    'Activation limit / Device transfer',
    'Reactivation / New computer',
    'Trial / Demo',
    'Serial number / Activation code',
    'Offline activation',
    'macOS activation issues',
    'Windows activation issues',
    'License transfer',
    'Deauthorization',
  ],
  'Purchasing & Billing': [
    'Upgrades & Discounts',
    'Bundles & Promotions',
    'Refunds & Cancellations',
    'Invoices & Receipts',
    'Checkout issues',
    'VAT & Currency',
    'Pricing',
    'Education discounts',
  ],
  'Installation & Updates': [
    'Download issues',
    'Installer errors',
    'Reinstall / Uninstall',
    'Plugin integration',
    'Presets migration',
    'Database migration',
    'macOS installation',
    'Windows installation',
    'Updates & Patches',
  ],
  'Compatibility': [
    'Supported cameras & RAW formats',
    'Optics Modules',
    'Operating system requirements',
    'Host application integration',
    'File formats (DNG, HEIF, HEIC)',
    'GPU / Hardware requirements',
    'Apple Silicon',
    'Third-party software',
  ],
  'Troubleshooting': [
    'Crashes & Freezes',
    'Performance issues',
    'GPU / Driver issues',
    'Export problems',
    'Import problems',
    'Database issues',
    'Plugin issues',
    'Display / UI issues',
  ],
  'Workflow & Features': [
    'DeepPRIME & Noise reduction',
    'Local adjustments & AI Masks',
    'Presets & Recipes',
    'Export options',
    'Batch processing',
    'Color management',
    'Metadata & Keywords',
    'External editors',
    'Non-destructive editing',
  ],
  'Image Processing': [
    'RAW processing',
    'Optical corrections',
    'Perspective correction',
    'Sharpening',
    'Color rendering',
    'Film simulations',
  ],
  'Nik Collection': [
    'Plugin installation',
    'Photoshop integration',
    'Lightroom integration',
    'PhotoLab integration',
    'Presets & Recipes',
  ],
  'Product Information': [
    'Feature comparison',
    'Editions (Essential vs Elite)',
    'New features',
    'Product roadmap',
    'PureRAW vs PhotoLab',
  ],
  'Support & Documentation': [
    'User guide',
    'Tutorials',
    'File upload / RAW samples',
    'Premium support',
  ],
};

// Get all categories
const CATEGORIES = Object.keys(CATEGORY_SUBCATEGORY_MAP);

// Get sub-categories for a given category
function getSubcategoriesForCategory(category: string): string[] {
  return CATEGORY_SUBCATEGORY_MAP[category] || [];
}

// DxO Product names mapping
const DXO_PRODUCTS: Record<string, string> = {
  photolab: 'PhotoLab',
  pureraw: 'PureRAW',
  filmpack: 'FilmPack',
  viewpoint: 'ViewPoint',
  nik_collection: 'Nik Collection',
};

// Get product display name
function getProductName(software: string): string | null {
  if (!software || software === 'unspecified') return null;
  const key = software.toLowerCase().replace(/\s+/g, '_');
  return DXO_PRODUCTS[key] || software;
}

// Get OS display name
function getOSName(os: string): string | null {
  if (!os || os === 'unspecified') return null;
  const lower = os.toLowerCase();
  if (lower.includes('windows') || lower === 'win') return 'Windows';
  if (lower.includes('macos') || lower.includes('mac')) return 'macOS';
  return os;
}

// Parse exact_content (YAML frontmatter + Markdown)
function parseQAIContent(exactContent: string | null): QAIContent | null {
  if (!exactContent) return null;

  try {
    // First try JSON (for backward compatibility)
    return JSON.parse(exactContent) as QAIContent;
  } catch {
    // Parse YAML frontmatter + Markdown format
    try {
      // Split by frontmatter delimiters
      const frontmatterMatch = exactContent.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

      if (!frontmatterMatch) {
        // No frontmatter, treat as plain text
        return {
          title: 'FAQ',
          question: '',
          answer: exactContent,
        };
      }

      const [, yamlContent, markdownContent] = frontmatterMatch;

      // Parse YAML frontmatter
      const frontmatter = yaml.parse(yamlContent) || {};

      // Extract title from markdown (first # heading)
      const titleMatch = markdownContent.match(/^#\s+(.+?)(?:\n|$)/m);
      const title = titleMatch ? titleMatch[1].trim() : 'FAQ';

      // Extract answer (everything after the title)
      let answer = markdownContent;
      if (titleMatch) {
        answer = markdownContent.substring(titleMatch[0].length).trim();
      }

      return {
        title,
        question: title, // Use title as question since they're the same in this format
        answer,
        category: frontmatter.category !== 'unspecified' ? frontmatter.category : undefined,
        sub_category: frontmatter.sub_category !== 'unspecified' ? frontmatter.sub_category : undefined,
        language: frontmatter.language !== 'unknown' ? frontmatter.language : undefined,
        intervention_type: frontmatter.intervention_type !== 'unspecified' ? frontmatter.intervention_type : undefined,
        intervention_detail: frontmatter.intervention_detail,
        source_faq_ids: frontmatter.faq_ids || [],
        source_ticket_ids: frontmatter.ticket_ids || [],
      };
    } catch (parseError) {
      console.error('[FAQ] Parse error:', parseError);
      return {
        title: 'FAQ',
        question: '',
        answer: exactContent,
      };
    }
  }
}

// Format versions array for display - sorts numerically and removes duplicates
function formatVersions(versions: string[]): string {
  if (versions.length === 0) return '';
  // Sort numerically if possible, otherwise alphabetically
  const sorted = [...versions].sort((a, b) => {
    const numA = parseInt(a, 10);
    const numB = parseInt(b, 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a.localeCompare(b);
  });
  return `(${sorted.join(', ')})`;
}

// Group and deduplicate applicable combinations - grouped by software
interface GroupedCombination {
  software: string;
  softwareVersions: Set<string>;
  osMap: Map<string, Set<string>>; // OS name -> OS versions
}

function groupApplicableCombinations(combinations: MetadataItem[] | null): GroupedCombination[] {
  if (!combinations || combinations.length === 0) return [];

  // Group by software only (combine all OS types with their versions)
  const groups = new Map<string, GroupedCombination>();

  for (const combo of combinations) {
    const software = getProductName(combo.software) || '';
    const os = getOSName(combo.os) || '';

    if (!software) continue;

    if (!groups.has(software)) {
      groups.set(software, {
        software,
        softwareVersions: new Set(),
        osMap: new Map(),
      });
    }

    const group = groups.get(software)!;

    // Add OS and its versions
    if (os) {
      if (!group.osMap.has(os)) {
        group.osMap.set(os, new Set());
      }
      const osVersions = group.osMap.get(os)!;
      
      // Add OS versions (handle both array and singular formats)
      if (combo.os_versions) {
        for (const v of combo.os_versions) {
          if (v && v !== 'unspecified') osVersions.add(v);
        }
      }
      if (combo.os_version && combo.os_version !== 'unspecified') {
        osVersions.add(combo.os_version);
      }
    }

    // Add software versions (handle both array and singular formats)
    if (combo.software_versions) {
      for (const v of combo.software_versions) {
        if (v && v !== 'unspecified') group.softwareVersions.add(v);
      }
    }
    if (combo.software_version && combo.software_version !== 'unspecified') {
      group.softwareVersions.add(combo.software_version);
    }
  }

  return Array.from(groups.values());
}

// Product badges component - renders grouped combinations
function ProductBadges({ combinations }: { combinations: MetadataItem[] | null }) {
  const grouped = groupApplicableCombinations(combinations);

  if (grouped.length === 0) return null;

  return (
    <>
      {grouped.map((group, idx) => {
        const softwareVersions = formatVersions([...group.softwareVersions]);
        
        // Build OS string with versions: "Windows (10, 11), macOS (13, 14)"
        const osEntries = [...group.osMap.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([osName, versions]) => {
            const versionStr = formatVersions([...versions]);
            return versionStr ? `${osName} ${versionStr}` : osName;
          });

        // Build display string: "PhotoLab (6, 7, 8) • Windows (10, 11), macOS (13, 14)"
        let display = group.software;
        if (softwareVersions) {
          display += ` ${softwareVersions}`;
        }
        if (osEntries.length > 0) {
          display += ` • ${osEntries.join(', ')}`;
        }

        return (
          <span key={idx} className="george-faq-pill product-pill">
            {display}
          </span>
        );
      })}
    </>
  );
}

export default function FaqPage() {
  const [qaiItems, setQaiItems] = useState<QAIRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'new' | 'modified'>('new');
  const [showMetadata, setShowMetadata] = useState(true);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>({
    title: '',
    question: '',
    answer: '',
    category: '',
    sub_category: '',
    intervention_type: '',
    intervention_detail: '',
  });
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'submitting' | 'polling' | 'success' | 'error'>('idle');
  const [updateMessage, setUpdateMessage] = useState<string>('');

  // Create Supabase client for auth
  const supabase = useMemo(() => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }, []);

  const fetchFaqs = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/faq');

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch FAQs');
      }

      const { qaiItems: items } = await response.json();
      console.log('[FAQ] Fetched QAIs count:', items.length);
      setQaiItems(items);
    } catch (err) {
      console.error('[FAQ] Fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load FAQs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFaqs();
  }, []);

  // Helper to get ticket count from item
  const getTicketCount = (item: QAIRecord): number => {
    const content = parseQAIContent(item.exact_content);
    return content?.source_ticket_ids?.length || item.ticket_count || 0;
  };

  // Helper to check if item is "modified" (has source FAQ IDs)
  const isModifiedItem = (item: QAIRecord): boolean => {
    const content = parseQAIContent(item.exact_content);
    const faqCount = content?.source_faq_ids?.length || item.faq_count || 0;
    return faqCount > 0;
  };

  // Sort and filter items - more tickets = more important = higher in list
  const filteredItems = useMemo(() => {
    let items = [...qaiItems];

    // Filter by type (new vs modified)
    if (typeFilter !== 'all') {
      items = items.filter((item) => {
        const isModified = isModifiedItem(item);
        if (typeFilter === 'new') return !isModified;
        if (typeFilter === 'modified') return isModified;
        return true;
      });
    }

    // Filter by search query if present
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      items = items.filter((item) => {
        const content = parseQAIContent(item.exact_content);
        if (!content) return false;
        if (content.title?.toLowerCase().includes(query)) return true;
        if (content.question?.toLowerCase().includes(query)) return true;
        if (content.answer?.toLowerCase().includes(query)) return true;
        const productMatch = item.applicable_combinations?.some(m => {
          const productName = getProductName(m.software);
          return productName?.toLowerCase().includes(query);
        });
        if (productMatch) return true;
        return false;
      });
    }

    // Sort by ticket count descending (more important first)
    items.sort((a, b) => getTicketCount(b) - getTicketCount(a));

    return items;
  }, [qaiItems, searchQuery, typeFilter]);

  // Calculate counts for filter badges
  const typeCounts = useMemo(() => {
    const newCount = qaiItems.filter(item => !isModifiedItem(item)).length;
    const modifiedCount = qaiItems.filter(item => isModifiedItem(item)).length;
    return {
      all: qaiItems.length,
      new: newCount,
      modified: modifiedCount,
    };
  }, [qaiItems]);

  const toggleExpand = (key: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Start editing a QAI
  const startEditing = (docId: string, content: QAIContent) => {
    setEditingId(docId);
    setEditForm({
      title: content.title || '',
      question: content.question || '',
      answer: content.answer || '',
      category: content.category || '',
      sub_category: content.sub_category || '',
      intervention_type: content.intervention_type || '',
      intervention_detail: content.intervention_detail || '',
    });
    setUpdateStatus('idle');
    setUpdateMessage('');
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingId(null);
    setEditForm({
      title: '',
      question: '',
      answer: '',
      category: '',
      sub_category: '',
      intervention_type: '',
      intervention_detail: '',
    });
    setUpdateStatus('idle');
    setUpdateMessage('');
  };

  // Poll job status
  const pollJobStatus = useCallback(async (jobIdToPoll: string, token: string) => {
    const maxAttempts = 60; // 5 minutes max (5s intervals)
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await fetch(`${EDGE_FUNCTION_URL}/status/${jobIdToPoll}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': SUPABASE_ANON_KEY,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to check job status');
        }

        const status: JobStatus = await response.json();

        if (status.status === 'completed') {
          if (status.result?.success) {
            setUpdateStatus('success');
            setUpdateMessage(status.result.message);
            // Refresh the FAQ list after successful update
            await fetchFaqs();
            // Auto-close edit mode after 2 seconds
            setTimeout(() => {
              cancelEditing();
            }, 2000);
          } else {
            setUpdateStatus('error');
            setUpdateMessage(status.result?.message || 'Update failed');
          }
          return;
        } else if (status.status === 'failed') {
          setUpdateStatus('error');
          setUpdateMessage(status.result?.message || 'Update failed');
          return;
        }

        // Still processing, wait and retry
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;
      } catch (err) {
        console.error('[FAQ] Poll error:', err);
        setUpdateStatus('error');
        setUpdateMessage(err instanceof Error ? err.message : 'Failed to check status');
        return;
      }
    }

    setUpdateStatus('error');
    setUpdateMessage('Update timed out. Please check the FAQ list manually.');
  }, []);

  // Submit QAI update
  const submitUpdate = async (docId: string) => {
    if (!supabase) {
      setUpdateStatus('error');
      setUpdateMessage('Supabase client not initialized');
      return;
    }

    setUpdateStatus('submitting');
    setUpdateMessage('Submitting update...');

    try {
      // Get the current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        throw new Error('You must be logged in to update FAQs');
      }

      // Build request body with only non-empty fields
      const body: Record<string, string> = { doc_id: docId };
      if (editForm.question.trim()) body.question = editForm.question;
      if (editForm.answer.trim()) body.answer = editForm.answer;
      if (editForm.title.trim()) body.title = editForm.title;
      if (editForm.category.trim()) body.category = editForm.category;
      if (editForm.sub_category.trim()) body.sub_category = editForm.sub_category;
      if (editForm.intervention_type.trim()) body.intervention_type = editForm.intervention_type;
      if (editForm.intervention_detail.trim()) body.intervention_detail = editForm.intervention_detail;

      const response = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || result.message || 'Failed to submit update');
      }

      // Update submitted, now poll for completion
      setUpdateStatus('polling');
      setUpdateMessage('Update in progress. This may take 30-60 seconds...');

      // Start polling in the background
      pollJobStatus(result.job_id, session.access_token);

    } catch (err) {
      console.error('[FAQ] Update error:', err);
      setUpdateStatus('error');
      setUpdateMessage(err instanceof Error ? err.message : 'Failed to update FAQ');
    }
  };

  // Update form field
  const updateFormField = (field: keyof EditFormState, value: string) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="george-app">
      <main className="george-docs">
        <section className="george-docs-hero">
          <img src="/george-logo.png" alt="George" className="george-docs-hero-logo" />
          <div>
            <h2>FAQ</h2>
            <p>Browse frequently asked questions derived from support interactions.</p>
          </div>
        </section>

        <section className="george-faq-search">
          <input
            type="text"
            className="george-faq-search-input"
            placeholder="Search FAQs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </section>

        <section className="george-faq-filters">
          <div className="george-faq-filter-group">
            <button
              type="button"
              className={`george-faq-filter-btn ${typeFilter === 'all' ? 'is-active' : ''}`}
              onClick={() => setTypeFilter('all')}
            >
              All <span className="george-faq-filter-count">{typeCounts.all}</span>
            </button>
            <button
              type="button"
              className={`george-faq-filter-btn is-new ${typeFilter === 'new' ? 'is-active' : ''}`}
              onClick={() => setTypeFilter('new')}
            >
              New <span className="george-faq-filter-count">{typeCounts.new}</span>
            </button>
            <button
              type="button"
              className={`george-faq-filter-btn is-modified ${typeFilter === 'modified' ? 'is-active' : ''}`}
              onClick={() => setTypeFilter('modified')}
            >
              Modified <span className="george-faq-filter-count">{typeCounts.modified}</span>
            </button>
          </div>

          <button
            type="button"
            className={`george-faq-metadata-toggle ${showMetadata ? 'is-active' : ''}`}
            onClick={() => setShowMetadata(!showMetadata)}
            title={showMetadata ? 'Hide product & version info' : 'Show product & version info'}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="3" width="14" height="2" rx="1" fill="currentColor"/>
              <rect x="1" y="7" width="10" height="2" rx="1" fill="currentColor"/>
              <rect x="1" y="11" width="6" height="2" rx="1" fill="currentColor"/>
            </svg>
            <span>Metadata</span>
            <span className={`george-faq-toggle-indicator ${showMetadata ? 'is-on' : ''}`} />
          </button>
        </section>

        {/* Visual Process Diagram - Apple-inspired full-width section */}
        <section className="george-faq-process">
          <details className="george-faq-process-details" open>
            <summary className="george-faq-process-toggle">
              <span>How it works</span>
              <svg className="george-faq-process-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </summary>

            <div className="george-faq-process-content">
              {/* Process Flow Diagram */}
              <div className="george-faq-flow">
                {/* Step 1: Input */}
                <div className="george-faq-flow-step">
                  <div className="george-faq-flow-icon">
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                      <rect x="4" y="6" width="24" height="20" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M4 12H28" stroke="currentColor" strokeWidth="1.5"/>
                      <circle cx="8" cy="9" r="1" fill="currentColor"/>
                      <circle cx="11" cy="9" r="1" fill="currentColor"/>
                      <circle cx="14" cy="9" r="1" fill="currentColor"/>
                      <path d="M8 16H20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      <path d="M8 20H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <div className="george-faq-flow-label">Tickets</div>
                  <div className="george-faq-flow-desc">Customer conversations</div>
                </div>

                <div className="george-faq-flow-connector">
                  <svg width="32" height="24" viewBox="0 0 32 24" fill="none">
                    <path d="M0 12H24M24 12L18 7M24 12L18 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>

                {/* Step 2: Analyze */}
                <div className="george-faq-flow-step">
                  <div className="george-faq-flow-icon">
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                      <circle cx="16" cy="16" r="10" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M16 10V16L20 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div className="george-faq-flow-label">Analyze</div>
                  <div className="george-faq-flow-desc">AI reads each ticket</div>
                </div>

                <div className="george-faq-flow-connector">
                  <svg width="32" height="24" viewBox="0 0 32 24" fill="none">
                    <path d="M0 12H24M24 12L18 7M24 12L18 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>

                {/* Step 3: Group Similar */}
                <div className="george-faq-flow-step is-highlight">
                  <div className="george-faq-flow-icon">
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                      <circle cx="10" cy="13" r="5" stroke="currentColor" strokeWidth="1.5"/>
                      <circle cx="22" cy="13" r="5" stroke="currentColor" strokeWidth="1.5"/>
                      <circle cx="16" cy="22" r="5" stroke="currentColor" strokeWidth="1.5"/>
                    </svg>
                  </div>
                  <div className="george-faq-flow-label">Group Similar</div>
                  <div className="george-faq-flow-desc">Find related questions</div>
                </div>

                <div className="george-faq-flow-connector">
                  <svg width="32" height="24" viewBox="0 0 32 24" fill="none">
                    <path d="M0 12H24M24 12L18 7M24 12L18 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>

                {/* Step 4: Create Answers */}
                <div className="george-faq-flow-step is-highlight">
                  <div className="george-faq-flow-icon">
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                      <path d="M8 8L16 16M8 24L16 16M24 16H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <circle cx="16" cy="16" r="3" fill="currentColor"/>
                    </svg>
                  </div>
                  <div className="george-faq-flow-label">Merge</div>
                  <div className="george-faq-flow-desc">Combine into one answer</div>
                </div>

                <div className="george-faq-flow-connector">
                  <svg width="32" height="24" viewBox="0 0 32 24" fill="none">
                    <path d="M0 12H24M24 12L18 7M24 12L18 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>

                {/* Step 5: Output */}
                <div className="george-faq-flow-step is-result">
                  <div className="george-faq-flow-icon">
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                      <path d="M9 4H19L25 10V28H9V4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                      <path d="M19 4V10H25" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                      <path d="M13 16H21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      <path d="M13 20H21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      <path d="M13 24H18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <div className="george-faq-flow-label">FAQ Ready</div>
                  <div className="george-faq-flow-desc">Review & publish</div>
                </div>
              </div>

              {/* Output Types */}
              <div className="george-faq-output-types">
                <div className="george-faq-output-type">
                  <div className="george-faq-output-badge is-new">New</div>
                  <div className="george-faq-output-info">
                    <div className="george-faq-output-title">Discovered Issues</div>
                    <div className="george-faq-output-desc">
                      Common problems identified across multiple customer tickets that weren&apos;t previously documented.
                    </div>
                  </div>
                </div>
                <div className="george-faq-output-type">
                  <div className="george-faq-output-badge is-modified">Modified</div>
                  <div className="george-faq-output-info">
                    <div className="george-faq-output-title">Enhanced Articles</div>
                    <div className="george-faq-output-desc">
                      Existing knowledge base articles enriched with insights from recent support interactions.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </details>
        </section>

        {loading && (
          <section className="george-faq-loading">
            <div className="george-faq-skeleton" />
            <div className="george-faq-skeleton" />
            <div className="george-faq-skeleton" />
          </section>
        )}

        {error && (
          <section className="george-faq-error">
            <p>Failed to load FAQs: {error}</p>
            <button type="button" onClick={fetchFaqs} className="george-faq-retry">
              Retry
            </button>
          </section>
        )}

        {!loading && !error && filteredItems.length === 0 && (
          <section className="george-faq-empty">
            {searchQuery.trim() ? <p>No FAQs match your search.</p> : <p>No FAQs available.</p>}
          </section>
        )}

        {!loading && !error && filteredItems.length > 0 && (
          <section className="george-faq-list">
            {filteredItems.map((item, idx) => {
              const key = item.doc_id || `qai-${idx}`;
              const isExpanded = expandedIds.has(key);
              const content = parseQAIContent(item.exact_content);
              const isEditing = editingId === item.doc_id;

              if (!content) return null;

              const ticketCount = content.source_ticket_ids?.length || item.ticket_count || 0;
              const faqCount = content.source_faq_ids?.length || item.faq_count || 0;
              const isModifiedFaq = faqCount > 0;

              return (
                <div key={key} className={`george-faq-card${isExpanded ? ' is-expanded' : ''}${isEditing ? ' is-editing' : ''}`}>
                  <button type="button" className="george-faq-card-header" onClick={() => toggleExpand(key)}>
                    <div className="george-faq-title-row">
                      <span className="george-faq-card-title">{content.title}</span>
                      <span className={`george-faq-type-badge ${isModifiedFaq ? 'is-modified' : 'is-new'}`}>
                        {isModifiedFaq ? 'Modified' : 'New'}
                      </span>
                    </div>
                    <span className="george-faq-card-chevron">{isExpanded ? '−' : '+'}</span>
                  </button>

                  <div className="george-faq-card-meta">
                    <div className="george-faq-meta-row">
                      {/* Product pills */}
                      {showMetadata && (
                        <div className="george-faq-pills">
                          <ProductBadges combinations={item.applicable_combinations} />
                        </div>
                      )}

                      {/* Source counts and date */}
                      <div className="george-faq-info">
                        {ticketCount > 0 && (
                          <span className="george-faq-stat tickets">
                            {ticketCount} ticket{ticketCount !== 1 ? 's' : ''}
                          </span>
                        )}
                        {faqCount > 0 && (
                          <span className="george-faq-stat faqs">
                            {faqCount} FAQ{faqCount !== 1 ? 's' : ''}
                          </span>
                        )}
                        <span className="george-faq-date">
                          {new Date(item.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {isExpanded && !isEditing && (
                    <div className="george-faq-card-content">
                      {content.question && (
                        <div className="george-faq-question">
                          <span className="george-faq-question-label">Question</span>
                          <span className="george-faq-question-text">{content.question}</span>
                        </div>
                      )}

                      {content.answer && (
                        <div className="george-faq-answer">
                          <span className="george-faq-answer-label">Answer</span>
                          <span className="george-faq-answer-text">{content.answer}</span>
                        </div>
                      )}

                      {content.intervention_detail && (
                        <div className="george-faq-note">
                          <span className="george-faq-note-label">Note</span>
                          <span className="george-faq-note-text">{content.intervention_detail}</span>
                        </div>
                      )}

                      {/* Edit button */}
                      <div className="george-faq-actions">
                        <button
                          type="button"
                          className="george-faq-edit-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditing(item.doc_id, content);
                          }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                          Edit FAQ
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Edit mode */}
                  {isExpanded && isEditing && (
                    <div className="george-faq-edit-form">
                      {/* Status message */}
                      {updateStatus !== 'idle' && (
                        <div className={`george-faq-update-status ${updateStatus}`}>
                          {updateStatus === 'submitting' && (
                            <span className="george-faq-spinner" />
                          )}
                          {updateStatus === 'polling' && (
                            <span className="george-faq-spinner" />
                          )}
                          {updateStatus === 'success' && (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                          {updateStatus === 'error' && (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10" />
                              <line x1="15" y1="9" x2="9" y2="15" />
                              <line x1="9" y1="9" x2="15" y2="15" />
                            </svg>
                          )}
                          <span>{updateMessage}</span>
                        </div>
                      )}

                      {/* Info note about automatic metadata updates */}
                      <div className="george-faq-edit-info">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="16" x2="12" y2="12" />
                          <line x1="12" y1="8" x2="12.01" y2="8" />
                        </svg>
                        <span>
                          When you mention specific software (PhotoLab, PureRAW, etc.), versions, or operating systems in the question or answer, the AI will automatically update the applicable combinations metadata.
                        </span>
                      </div>

                      <div className="george-faq-form-group">
                        <label className="george-faq-form-label">Title</label>
                        <input
                          type="text"
                          className="george-faq-form-input"
                          value={editForm.title}
                          onChange={(e) => updateFormField('title', e.target.value)}
                          disabled={updateStatus === 'submitting' || updateStatus === 'polling'}
                        />
                      </div>

                      <div className="george-faq-form-group">
                        <label className="george-faq-form-label">Question</label>
                        <textarea
                          className="george-faq-form-textarea"
                          rows={3}
                          value={editForm.question}
                          onChange={(e) => updateFormField('question', e.target.value)}
                          disabled={updateStatus === 'submitting' || updateStatus === 'polling'}
                        />
                      </div>

                      <div className="george-faq-form-group">
                        <label className="george-faq-form-label">Answer</label>
                        <textarea
                          className="george-faq-form-textarea large"
                          rows={8}
                          value={editForm.answer}
                          onChange={(e) => updateFormField('answer', e.target.value)}
                          disabled={updateStatus === 'submitting' || updateStatus === 'polling'}
                        />
                      </div>

                      <div className="george-faq-form-row">
                        <div className="george-faq-form-group">
                          <label className="george-faq-form-label">Category</label>
                          <select
                            className="george-faq-form-select"
                            value={editForm.category}
                            onChange={(e) => {
                              updateFormField('category', e.target.value);
                              // Reset sub-category when category changes
                              updateFormField('sub_category', '');
                            }}
                            disabled={updateStatus === 'submitting' || updateStatus === 'polling'}
                          >
                            <option value="">Select a category...</option>
                            {CATEGORIES.map((cat) => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        </div>
                        <div className="george-faq-form-group">
                          <label className="george-faq-form-label">Sub-category</label>
                          <select
                            className="george-faq-form-select"
                            value={editForm.sub_category}
                            onChange={(e) => updateFormField('sub_category', e.target.value)}
                            disabled={updateStatus === 'submitting' || updateStatus === 'polling' || !editForm.category}
                          >
                            <option value="">{editForm.category ? 'Select a sub-category...' : 'Select category first'}</option>
                            {getSubcategoriesForCategory(editForm.category).map((sub) => (
                              <option key={sub} value={sub}>{sub}</option>
                            ))}
                          </select>
                          {!editForm.category && (
                            <span className="george-faq-form-hint">Please select a category first</span>
                          )}
                        </div>
                      </div>

                      <div className="george-faq-form-group">
                        <label className="george-faq-form-label">Note / Intervention Detail</label>
                        <textarea
                          className="george-faq-form-textarea"
                          rows={2}
                          value={editForm.intervention_detail}
                          onChange={(e) => updateFormField('intervention_detail', e.target.value)}
                          disabled={updateStatus === 'submitting' || updateStatus === 'polling'}
                        />
                      </div>

                      <div className="george-faq-form-actions">
                        <button
                          type="button"
                          className="george-faq-cancel-btn"
                          onClick={cancelEditing}
                          disabled={updateStatus === 'submitting' || updateStatus === 'polling'}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="george-faq-save-btn"
                          onClick={() => submitUpdate(item.doc_id)}
                          disabled={updateStatus === 'submitting' || updateStatus === 'polling' || updateStatus === 'success'}
                        >
                          {updateStatus === 'submitting' || updateStatus === 'polling' ? 'Saving...' : 'Save Changes'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}
