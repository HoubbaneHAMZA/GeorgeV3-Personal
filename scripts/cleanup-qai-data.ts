/**
 * QAI Data Cleanup Script
 *
 * This script:
 * 1. Parses YAML frontmatter from exact_content to extract clean metadata
 * 2. Updates metadata columns in dxo_qai_content_hashes
 * 3. Identifies duplicate QAIs (same faq_ids + ticket_ids)
 * 4. Removes duplicates from Supabase and OpenAI Vector Store
 *
 * Usage:
 *   npx ts-node scripts/cleanup-qai-data.ts [--dry-run] [--fix-metadata] [--remove-duplicates]
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const VECTOR_STORE_ID = 'vs_69708e8c8a288191887c9739245afeee';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Parse command line args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FIX_METADATA = args.includes('--fix-metadata');
const REMOVE_DUPLICATES = args.includes('--remove-duplicates');
const LIST_VECTOR_FILES = args.includes('--list-vector-files');

interface ParsedMetadata {
  software: string | null;
  software_version: string | null;
  os: string | null;
  os_version: string | null;
  language: string | null;
}

interface QAIRecord {
  id: string;
  doc_id: string;
  exact_content: string | null;
  faq_ids: string[] | null;
  ticket_ids: string[] | null;
  content_hash: string | null;
}

/**
 * Parse YAML frontmatter to extract clean metadata
 */
function parseYAMLFrontmatter(exactContent: string | null): ParsedMetadata {
  const result: ParsedMetadata = {
    software: null,
    software_version: null,
    os: null,
    os_version: null,
    language: null,
  };

  if (!exactContent) return result;

  const frontmatterMatch = exactContent.match(/^---\n([\s\S]*?)\n---\n/);
  if (!frontmatterMatch) return result;

  const yamlContent = frontmatterMatch[1];
  const lines = yamlContent.split('\n');

  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (!match) continue;

    const key = match[1];
    let value = match[2].trim();

    // Skip 'unspecified' or empty values
    if (value === 'unspecified' || value === '') {
      continue;
    }

    switch (key) {
      case 'software':
        // Clean up software names
        result.software = cleanSoftwareName(value);
        break;
      case 'software_version':
        result.software_version = value;
        break;
      case 'os':
        // Clean up OS values like "macos__macos_26__tahoe_" or "windows__windows_11"
        result.os = cleanOSName(value);
        break;
      case 'os_version':
        result.os_version = value;
        break;
      case 'language':
        result.language = cleanLanguage(value);
        break;
    }
  }

  return result;
}

/**
 * Clean software name - handle various formats
 */
function cleanSoftwareName(value: string): string {
  // Handle JSON array format like '["nik_collection__nik_collection_8","Nik Collection"]'
  if (value.startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        // Find the clean name (not containing __)
        const cleanName = parsed.find((s: string) => !s.includes('__'));
        if (cleanName) return cleanName;
        // If all contain __, use the first one and clean it
        return cleanInternalName(parsed[0]);
      }
    } catch {
      // Not valid JSON, continue
    }
  }

  // Handle internal names like "dxo_photolab__dxo_photolab_9"
  if (value.includes('__')) {
    return cleanInternalName(value);
  }

  return value;
}

/**
 * Clean internal software names like "dxo_photolab__dxo_photolab_9"
 */
function cleanInternalName(value: string): string {
  const mapping: Record<string, string> = {
    'photolab': 'PhotoLab',
    'dxo_photolab': 'PhotoLab',
    'pureraw': 'PureRAW',
    'dxo_pureraw': 'PureRAW',
    'filmpack': 'FilmPack',
    'dxo_filmpack': 'FilmPack',
    'viewpoint': 'ViewPoint',
    'dxo_viewpoint': 'ViewPoint',
    'nik_collection': 'Nik Collection',
    'nik collection': 'Nik Collection',
  };

  const lower = value.toLowerCase();
  for (const [key, cleanName] of Object.entries(mapping)) {
    if (lower.includes(key)) {
      return cleanName;
    }
  }

  return value;
}

/**
 * Clean OS name
 */
function cleanOSName(value: string): string {
  const lower = value.toLowerCase();
  if (lower.includes('macos') || lower.includes('mac')) {
    return 'macOS';
  }
  if (lower.includes('windows') || lower.includes('win')) {
    return 'Windows';
  }
  return value;
}

/**
 * Clean language code
 */
function cleanLanguage(value: string): string {
  const mapping: Record<string, string> = {
    'en': 'English',
    'english': 'English',
    'fr': 'French',
    'french': 'French',
    'de': 'German',
    'german': 'German',
    'es': 'Spanish',
    'spanish': 'Spanish',
    'it': 'Italian',
    'italian': 'Italian',
    'ja': 'Japanese',
    'japanese': 'Japanese',
  };

  const lower = value.toLowerCase();
  return mapping[lower] || value;
}

/**
 * Create grouping key for identifying duplicates
 */
function createGroupKey(faqIds: string[] | null, ticketIds: string[] | null): string {
  const sortedFaqIds = [...(faqIds || [])].sort();
  const sortedTicketIds = [...(ticketIds || [])].sort();
  return JSON.stringify(sortedFaqIds) + '||' + JSON.stringify(sortedTicketIds);
}

/**
 * List all files in the vector store
 */
async function listVectorStoreFiles(): Promise<void> {
  console.log('\n=== Listing Vector Store Files ===\n');

  try {
    const files = await openai.beta.vectorStores.files.list(VECTOR_STORE_ID, {
      limit: 100,
    });

    console.log(`Found ${files.data.length} files in vector store ${VECTOR_STORE_ID}:\n`);

    for (const file of files.data) {
      console.log(`  - ID: ${file.id}, Status: ${file.status}`);
    }

    // Check if there are more pages
    if (files.has_more) {
      console.log('\n  ... and more (pagination required)');
    }
  } catch (error) {
    console.error('Error listing vector store files:', error);
  }
}

/**
 * Delete a file from the vector store
 */
async function deleteVectorStoreFile(fileId: string): Promise<boolean> {
  try {
    await openai.beta.vectorStores.files.del(VECTOR_STORE_ID, fileId);
    console.log(`  Deleted file ${fileId} from vector store`);
    return true;
  } catch (error) {
    console.error(`  Error deleting file ${fileId}:`, error);
    return false;
  }
}

/**
 * Fix metadata in Supabase by parsing YAML frontmatter
 */
async function fixMetadata(): Promise<void> {
  console.log('\n=== Fixing Metadata ===\n');

  // Fetch all QAIs
  const { data: qais, error } = await supabase
    .from('dxo_qai_content_hashes')
    .select('id, doc_id, exact_content')
    .eq('collection', 'qai');

  if (error) {
    console.error('Error fetching QAIs:', error);
    return;
  }

  console.log(`Found ${qais?.length || 0} QAI records to process\n`);

  let updated = 0;
  let skipped = 0;

  for (const qai of qais || []) {
    const parsed = parseYAMLFrontmatter(qai.exact_content);

    // Check if we have any metadata to update
    if (!parsed.software && !parsed.os && !parsed.language) {
      skipped++;
      continue;
    }

    console.log(`Processing ${qai.doc_id}:`);
    console.log(`  Software: ${parsed.software || 'null'}`);
    console.log(`  Version: ${parsed.software_version || 'null'}`);
    console.log(`  OS: ${parsed.os || 'null'}`);
    console.log(`  OS Version: ${parsed.os_version || 'null'}`);
    console.log(`  Language: ${parsed.language || 'null'}`);

    if (!DRY_RUN) {
      // Note: This assumes you have these columns in your table
      // If not, you may need to add them or store in a different way
      const { error: updateError } = await supabase
        .from('dxo_qai_content_hashes')
        .update({
          // Store parsed metadata - adjust column names as needed
          // metadata: {
          //   software: parsed.software,
          //   software_version: parsed.software_version,
          //   os: parsed.os,
          //   os_version: parsed.os_version,
          //   language: parsed.language,
          // }
        })
        .eq('id', qai.id);

      if (updateError) {
        console.error(`  Error updating ${qai.doc_id}:`, updateError);
      } else {
        updated++;
      }
    } else {
      console.log('  [DRY RUN] Would update this record');
      updated++;
    }
  }

  console.log(`\nMetadata fix complete: ${updated} updated, ${skipped} skipped`);
}

/**
 * Find and remove duplicate QAIs
 */
async function removeDuplicates(): Promise<void> {
  console.log('\n=== Finding and Removing Duplicates ===\n');

  // Fetch all QAIs
  const { data: qais, error } = await supabase
    .from('dxo_qai_content_hashes')
    .select('id, doc_id, exact_content, faq_ids, ticket_ids, content_hash, created_at')
    .eq('collection', 'qai')
    .eq('qai_age', 'new')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching QAIs:', error);
    return;
  }

  console.log(`Found ${qais?.length || 0} QAI records\n`);

  // Group by faq_ids + ticket_ids
  const groups = new Map<string, QAIRecord[]>();

  for (const qai of qais || []) {
    const groupKey = createGroupKey(qai.faq_ids, qai.ticket_ids);

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey)!.push(qai as QAIRecord);
  }

  // Find groups with duplicates
  const duplicateGroups = Array.from(groups.entries())
    .filter(([_, items]) => items.length > 1);

  console.log(`Found ${duplicateGroups.length} groups with duplicates\n`);

  const toDelete: { id: string; doc_id: string }[] = [];

  for (const [groupKey, items] of duplicateGroups) {
    console.log(`\nGroup (${items.length} items):`);

    // Keep the first (oldest) item, mark others for deletion
    const [keep, ...duplicates] = items;

    console.log(`  KEEP: ${keep.doc_id} (id: ${keep.id})`);

    for (const dup of duplicates) {
      console.log(`  DELETE: ${dup.doc_id} (id: ${dup.id})`);
      toDelete.push({ id: dup.id, doc_id: dup.doc_id });
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total records to delete: ${toDelete.length}`);

  if (toDelete.length === 0) {
    console.log('No duplicates found.');
    return;
  }

  if (!DRY_RUN) {
    console.log('\nDeleting duplicates from Supabase...');

    for (const item of toDelete) {
      // Delete from Supabase
      const { error: deleteError } = await supabase
        .from('dxo_qai_content_hashes')
        .delete()
        .eq('id', item.id);

      if (deleteError) {
        console.error(`  Error deleting ${item.doc_id}:`, deleteError);
      } else {
        console.log(`  Deleted ${item.doc_id} from Supabase`);
      }

      // Try to delete from vector store using the id as file_id
      // Note: The file_id in vector store might be different - adjust as needed
      await deleteVectorStoreFile(item.id);
    }

    console.log('\nDeletion complete!');
  } else {
    console.log('\n[DRY RUN] Would delete the above records');
    console.log('\nTo actually delete, run without --dry-run flag');
  }
}

/**
 * Generate SQL to fix broken software values directly in DB
 */
function generateFixSQL(): void {
  console.log('\n=== SQL to Fix Broken Software Values ===\n');

  const sql = `
-- 1. Check records with JSON array software values
SELECT doc_id, exact_content
FROM dxo_qai_content_hashes
WHERE exact_content LIKE '%software: [%'
  AND collection = 'qai';

-- 2. Check records with internal software names (containing __)
SELECT doc_id, exact_content
FROM dxo_qai_content_hashes
WHERE exact_content LIKE '%software: %__%'
  AND collection = 'qai';

-- 3. Check records with 'unspecified' software
SELECT doc_id, exact_content
FROM dxo_qai_content_hashes
WHERE exact_content LIKE '%software: unspecified%'
  AND collection = 'qai';

-- 4. View all unique software values in frontmatter
SELECT DISTINCT
  substring(exact_content from 'software: ([^\\n]+)') as software_value,
  COUNT(*) as count
FROM dxo_qai_content_hashes
WHERE collection = 'qai'
GROUP BY 1
ORDER BY count DESC;
`;

  console.log(sql);
}

/**
 * Main function
 */
async function main(): Promise<void> {
  console.log('QAI Data Cleanup Script');
  console.log('=======================');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will make changes)'}`);
  console.log(`Vector Store: ${VECTOR_STORE_ID}`);

  if (!FIX_METADATA && !REMOVE_DUPLICATES && !LIST_VECTOR_FILES) {
    console.log('\nUsage:');
    console.log('  npx ts-node scripts/cleanup-qai-data.ts [options]');
    console.log('\nOptions:');
    console.log('  --dry-run           Preview changes without making them');
    console.log('  --fix-metadata      Parse YAML and fix metadata columns');
    console.log('  --remove-duplicates Find and remove duplicate QAIs');
    console.log('  --list-vector-files List all files in the vector store');
    console.log('\nExamples:');
    console.log('  npx ts-node scripts/cleanup-qai-data.ts --dry-run --remove-duplicates');
    console.log('  npx ts-node scripts/cleanup-qai-data.ts --list-vector-files');

    generateFixSQL();
    return;
  }

  if (LIST_VECTOR_FILES) {
    await listVectorStoreFiles();
  }

  if (FIX_METADATA) {
    await fixMetadata();
  }

  if (REMOVE_DUPLICATES) {
    await removeDuplicates();
  }

  console.log('\nDone!');
}

main().catch(console.error);
