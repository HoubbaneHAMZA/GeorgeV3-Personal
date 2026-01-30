import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { Pool } from 'pg';

// Create a connection pool using the DATABASE_URL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});


// Escape a value for SQL insertion (returns empty string for null/undefined, not NULL)
function escapeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "''";
  }
  if (typeof value === 'number') {
    return `'${String(value)}'`;
  }
  // Escape single quotes by doubling them
  const str = String(value).replace(/'/g, "''");
  return `'${str}'`;
}

// Parse software name and version from strings like "DxO Photolab 9"
function parseSoftware(text: string): { name: string; version: string } {
  if (!text || typeof text !== 'string') {
    return { name: '', version: '' };
  }

  const cleaned = text.trim().replace(/\s+/g, ' ');

  // Handle DxO products: "DxO Photolab 9", "DxO PhotoLab 9", "DxO PureRAW 5",
  // "DxO FilmPack 5.5.26 and up", "DxO ViewPoint 5"
  const dxoMatch = cleaned.match(/^(DxO\s+\w+)\s+([0-9]+(?:\.[0-9]+)*)(?:\s+(.+))?$/i);
  if (dxoMatch) {
    const suffix = dxoMatch[3] ? ` ${dxoMatch[3].trim()}` : '';
    return { name: dxoMatch[1].trim(), version: `${dxoMatch[2].trim()}${suffix}`.trim() };
  }

  // Handle "DxO OpticsPro 11" or "DxO Optics Pro 9"
  const opticsMatch = cleaned.match(/^(DxO\s+Optics\s*Pro)\s+(\d+)/i);
  if (opticsMatch) {
    return { name: 'DxO OpticsPro', version: opticsMatch[2] };
  }

  // Fallback: try to split on last space-followed-by-number
  const fallbackMatch = cleaned.match(/^(.+?)\s+(\d+(?:\.\d+)?)$/);
  if (fallbackMatch) {
    return { name: fallbackMatch[1].trim(), version: fallbackMatch[2] };
  }

  return { name: cleaned, version: '' };
}

// Extract Nik plugin name + version from a cell
function parseNikPluginRow(
  cellText: string,
  currentNikVersion: string
): { pluginName: string; version: string } {
  const text = cellText.trim();

  // Inline versions like "Nik 8 Color Efex Pro" or "Nik Collection 8 Color Efex Pro"
  const inlineNik = text.match(/^Nik\s+(\d+|2018)\s+(.+)$/i);
  if (inlineNik) {
    return { pluginName: inlineNik[2].trim(), version: inlineNik[1] };
  }

  const inlineNikCollection = text.match(/^Nik\s+Collection\s+(\d+|2018)\s+(.+)$/i);
  if (inlineNikCollection) {
    return { pluginName: inlineNikCollection[2].trim(), version: inlineNikCollection[1] };
  }

  return { pluginName: text, version: currentNikVersion };
}

function buildNikSoftwareName(pluginName: string): string {
  const cleaned = pluginName.trim();
  if (!cleaned) return 'Nik Collection';
  if (/^nik\s+collection/i.test(cleaned)) return cleaned;
  return `Nik Collection - ${cleaned}`;
}

// Clean target names - preserve newlines as they exist in original data
function cleanTargetName(text: string, preserveNewlines: boolean = true): string {
  if (!text || typeof text !== 'string') return '';

  if (preserveNewlines) {
    // Just trim whitespace at start/end, preserve internal newlines
    return text.trim();
  }

  // Legacy: Replace newlines with spaces (not used for most cases now)
  let cleaned = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  cleaned = cleaned.replace(/\s*\([^)]+\)\s*$/, '').trim();
  return cleaned;
}

// Map status values from Excel to database format
function mapStatus(value: unknown): string {
  if (value === null || value === undefined) return 'not compatible';

  const str = String(value).trim();

  // Check marks
  if (str === '✓' || str === '✔' || str.toLowerCase() === 'yes') {
    return 'compatible';
  }

  // X marks
  if (str === '✕' || str === '✗' || str === '×' || str.toLowerCase() === 'no') {
    return 'not compatible';
  }

  // Empty or whitespace only
  if (!str || str === '-' || str === '—') {
    return 'not compatible';
  }

  // Keep text values as-is (like "v22H2 or Higher (64bit only)", "64bit only", etc.)
  return str;
}

function normalizeSheetName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type SheetKind =
  | 'dxo_windows'
  | 'dxo_macos'
  | 'dxo_lr'
  | 'dxo_host_apps'
  | 'dxo_dpr'
  | 'nik_plugin'
  | 'nik_mac'
  | 'nik_win';

function classifySheetName(name: string): SheetKind | null {
  const norm = normalizeSheetName(name);

  // Nik sheets first
  if (norm.includes('nik')) {
    if (norm.includes('mac') || norm.includes('macos') || norm.includes('osx')) {
      return 'nik_mac';
    }
    if (norm.includes('win') || norm.includes('windows')) {
      return 'nik_win';
    }
    // Any remaining Nik sheets are treated as plugin compatibility
    return 'nik_plugin';
  }

  // DxO sheets
  if (norm === 'windows' || norm.includes('windows')) return 'dxo_windows';
  if (norm === 'macos' || norm.includes('mac os') || norm.includes('macos') || norm.includes('osx')) {
    return 'dxo_macos';
  }
  if (norm === 'lr' || norm.includes('lightroom') || norm.includes(' lr ')) {
    return 'dxo_lr';
  }
  if (
    norm.includes('host') ||
    norm.includes('vs') ||
    norm.includes('dfp') ||
    norm.includes('dvp') ||
    norm.includes('filmpack') ||
    norm.includes('viewpoint')
  ) {
    return 'dxo_host_apps';
  }
  if (norm.includes('dpr') || norm.includes('pureraw')) return 'dxo_dpr';

  return null;
}

// Type for a compatibility record
interface CompatRecord {
  software: string;
  software_version: string;
  feature: string;
  compat_target: string;
  status: string;
}

// Process Windows/macOS sheets (OS compatibility)
function processOsSheet(
  workbook: XLSX.WorkBook,
  sheetName: string,
  feature: string
): CompatRecord[] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];

  const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
  const records: CompatRecord[] = [];

  if (data.length < 2) return [];

  // Row 1 has OS headers (columns C onwards typically)
  const headerRow = data[1] ;
  const osHeaders: { col: number; name: string }[] = [];

  for (let col = 2; col < headerRow.length; col++) {
    const header = headerRow[col];
    if (header && typeof header === 'string' && header.trim()) {
      osHeaders.push({ col, name: cleanTargetName(header) });
    }
  }

  // Process data rows (row 2 onwards)
  for (let row = 2; row < data.length; row++) {
    const rowData = data[row] ;
    if (!rowData || !rowData[1]) continue;

    const softwareCell = rowData[1];
    if (!softwareCell || typeof softwareCell !== 'string') continue;

    const { name: softwareName, version } = parseSoftware(softwareCell);
    if (!softwareName) continue;

    for (const osHeader of osHeaders) {
      const cellValue = rowData[osHeader.col];
      const status = mapStatus(cellValue);

      if (osHeader.name) {
        records.push({
          software: softwareName,
          software_version: version || '',
          feature,
          compat_target: osHeader.name,
          status
        });
      }
    }
  }

  return records;
}

// Process LR (Lightroom) sheet
function processLrSheet(workbook: XLSX.WorkBook): CompatRecord[] {
  const sheet = workbook.Sheets['LR'];
  if (!sheet) return [];

  const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
  const records: CompatRecord[] = [];

  if (data.length < 2) return [];

  // Row 1 has DxO software headers (columns C onwards)
  const headerRow = data[1] ;
  const dxoHeaders: { col: number; name: string; version: string }[] = [];

  for (let col = 2; col < headerRow.length; col++) {
    const header = headerRow[col];
    if (header && typeof header === 'string' && header.trim()) {
      const { name, version } = parseSoftware(header);
      if (name) {
        dxoHeaders.push({ col, name, version });
      }
    }
  }

  // Process data rows (row 2 onwards)
  for (let row = 2; row < data.length; row++) {
    const rowData = data[row] ;
    if (!rowData || !rowData[1]) continue;

    const lrCell = rowData[1];
    if (!lrCell || typeof lrCell !== 'string') continue;

    // Determine feature from row header
    const lrText = lrCell.toLowerCase();
    let feature = 'export to';
    if (lrText.includes('plugin') && lrText.includes('export')) {
      feature = 'plugin + export to';
    } else if (lrText.includes('plugin')) {
      feature = 'plugin';
    }

    // Clean the Lightroom name
    const lrName = cleanTargetName(lrCell.split('\n')[0]); // Get first line

    for (const dxoHeader of dxoHeaders) {
      const cellValue = rowData[dxoHeader.col];
      const status = mapStatus(cellValue);

      records.push({
        software: dxoHeader.name,
        software_version: dxoHeader.version,
        feature,
        compat_target: lrName,
        status
      });
    }
  }

  return records;
}

// Process DFP DVP vs host apps sheet
function processHostAppsSheet(workbook: XLSX.WorkBook): CompatRecord[] {
  const sheet = workbook.Sheets['DFP  DVP vs host apps'];
  if (!sheet) return [];

  const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
  const records: CompatRecord[] = [];

  if (data.length < 2) return [];

  // Row 1 has plugin headers (FilmPack, ViewPoint versions)
  const headerRow = data[1] ;
  const pluginHeaders: { col: number; name: string; version: string }[] = [];

  for (let col = 2; col < headerRow.length; col++) {
    const header = headerRow[col];
    if (header && typeof header === 'string' && header.trim()) {
      const { name, version } = parseSoftware(header);
      if (name) {
        pluginHeaders.push({ col, name, version });
      }
    }
  }

  // Process data rows
  for (let row = 2; row < data.length; row++) {
    const rowData = data[row] ;
    if (!rowData || !rowData[1]) continue;

    const hostCell = rowData[1];
    if (!hostCell || typeof hostCell !== 'string') continue;

    const hostText = cleanTargetName(hostCell);
    const { name: hostName, version: hostVersion } = parseSoftware(hostCell);

    // Check if this is a DxO product row (PhotoLab, OpticsPro) or Adobe/external product row
    const isDxoRow = hostText.toLowerCase().includes('dxo') || hostText.toLowerCase().includes('optics');

    for (const pluginHeader of pluginHeaders) {
      const cellValue = rowData[pluginHeader.col];
      const status = mapStatus(cellValue);

      if (isDxoRow) {
        // DxO row: software = row (PhotoLab), compat_target = column (FilmPack)
        records.push({
          software: hostName || hostText,
          software_version: hostVersion || '',
          feature: 'host',
          compat_target: `${pluginHeader.name} ${pluginHeader.version}`.trim(),
          status
        });
      } else {
        // Adobe row: software = column (FilmPack), compat_target = row (Photoshop)
        records.push({
          software: pluginHeader.name,
          software_version: pluginHeader.version,
          feature: 'plugin',
          compat_target: hostText,
          status
        });
      }
    }
  }

  return records;
}

// Process DPR (PureRAW) sheet
function processDprSheet(workbook: XLSX.WorkBook): CompatRecord[] {
  const sheet = workbook.Sheets['DPR'];
  if (!sheet) return [];

  const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
  const records: CompatRecord[] = [];

  if (data.length < 2) return [];

  let currentFeature = 'export to';
  let appHeaders: { col: number; name: string }[] = [];

  for (let row = 1; row < data.length; row++) {
    const rowData = data[row] ;
    if (!rowData) continue;

    const cellB = rowData[1];
    if (!cellB || typeof cellB !== 'string') continue;

    const cellText = cellB.trim();

    // Check if this is a section header
    if (cellText.toLowerCase().includes('export to') || cellText.toLowerCase().includes('dng/jpeg')) {
      currentFeature = 'export to';
      // Parse headers from this row
      appHeaders = [];
      for (let col = 2; col < rowData.length; col++) {
        const header = rowData[col];
        if (header && typeof header === 'string' && header.trim()) {
          appHeaders.push({ col, name: cleanTargetName(header) });
        }
      }
      continue;
    }

    if (cellText.toLowerCase().includes('plugin instance')) {
      currentFeature = 'plugin';
      // Parse headers from this row
      appHeaders = [];
      for (let col = 2; col < rowData.length; col++) {
        const header = rowData[col];
        if (header && typeof header === 'string' && header.trim()) {
          appHeaders.push({ col, name: cleanTargetName(header) });
        }
      }
      continue;
    }

    // Regular data row
    if (cellText.toLowerCase().includes('pureraw')) {
      const { name, version } = parseSoftware(cellText);

      for (const appHeader of appHeaders) {
        const cellValue = rowData[appHeader.col];
        const status = mapStatus(cellValue);

        records.push({
          software: name || 'DxO PureRAW',
          software_version: version || '',
          feature: currentFeature,
          compat_target: appHeader.name,
          status
        });
      }
    }
  }

  return records;
}

// Process Nik Collection sheets (plugin compatibility)
function processNikPluginSheet(
  workbook: XLSX.WorkBook,
  sheetName: string
): CompatRecord[] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];

  const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
  const records: CompatRecord[] = [];

  if (data.length < 2) return [];

  // Row 2 (index 1) has host application headers in columns C onwards
  const headerRow = data[1] ;
  let appHeaders: { col: number; name: string }[] = [];
  let currentNikVersion = ''; // Track version from section headers

  for (let col = 2; col < headerRow.length; col++) {
    const header = headerRow[col];
    if (header && typeof header === 'string' && header.trim()) {
      appHeaders.push({ col, name: cleanTargetName(header) });
    }
  }

  // Extract version from first section header if present in row 2
  const firstSectionHeader = headerRow[1];
  if (firstSectionHeader && typeof firstSectionHeader === 'string') {
    const versionMatch = firstSectionHeader.match(/Nik\s+Collection\s+(\d+|2018)/i);
    if (versionMatch) {
      currentNikVersion = versionMatch[1];
    }
  }

  // Process data rows (row 3 onwards = index 2)
  for (let row = 2; row < data.length; row++) {
    const rowData = data[row] ;
    if (!rowData || !rowData[1]) continue;

    const nikCell = rowData[1];
    if (!nikCell || typeof nikCell !== 'string') continue;

    const cellText = nikCell.trim();

    // Check for section headers like "Plugins\nNik Collection 8"
    if (cellText.toLowerCase().includes('plugins')) {
      // Extract version from section header
      const versionMatch = cellText.match(/Nik\s+Collection\s+(\d+|2018)/i);
      if (versionMatch) {
        currentNikVersion = versionMatch[1];
      }
      // Update headers from this row
      appHeaders = [];
      for (let col = 2; col < rowData.length; col++) {
        const header = rowData[col];
        if (header && typeof header === 'string' && header.trim()) {
          appHeaders.push({ col, name: cleanTargetName(header) });
        }
      }
      continue;
    }

    // Parse plugin name + version (keep plugin name as software, prefixed by Nik Collection)
    const { pluginName, version } = parseNikPluginRow(cellText, currentNikVersion);
    if (!pluginName) continue;
    const softwareName = buildNikSoftwareName(pluginName);

    for (const appHeader of appHeaders) {
      const cellValue = rowData[appHeader.col];
      const status = mapStatus(cellValue);

      if (appHeader.name) {
        records.push({
          software: softwareName,
          software_version: version || '',
          feature: 'plugin',
          compat_target: appHeader.name,
          status
        });
      }
    }
  }

  return records;
}

// Process Nik Mac/Win sheets (OS compatibility for Nik plugins)
// The compat_target is the OS version (macOS 15, Windows 11, etc.)
function processNikMacWinSheet(
  workbook: XLSX.WorkBook,
  sheetName: string
): CompatRecord[] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];

  const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
  const records: CompatRecord[] = [];

  if (data.length < 2) return [];

  // Row 2 (index 1) has OS headers in columns C onwards
  const headerRow = data[1] ;
  let osHeaders: { col: number; name: string }[] = [];
  let currentNikVersion = ''; // Track version from section headers

  for (let col = 2; col < headerRow.length; col++) {
    const header = headerRow[col];
    if (header && typeof header === 'string' && header.trim()) {
      osHeaders.push({ col, name: cleanTargetName(header) }); // preserves newlines
    }
  }

  // Extract version from first section header if present in row 2
  const firstSectionHeader = headerRow[1];
  if (firstSectionHeader && typeof firstSectionHeader === 'string') {
    const versionMatch = firstSectionHeader.match(/Nik\s+Collection\s+(\d+|2018)/i);
    if (versionMatch) {
      currentNikVersion = versionMatch[1];
    }
  }

  // Process data rows (row 3 onwards = index 2)
  for (let row = 2; row < data.length; row++) {
    const rowData = data[row] ;
    if (!rowData || !rowData[1]) continue;

    const nikCell = rowData[1];
    if (!nikCell || typeof nikCell !== 'string') continue;

    const cellText = nikCell.trim();

    // Check for section headers like "Plugins\nNik Collection 8"
    if (cellText.toLowerCase().includes('plugins')) {
      // Extract version from section header
      const versionMatch = cellText.match(/Nik\s+Collection\s+(\d+|2018)/i);
      if (versionMatch) {
        currentNikVersion = versionMatch[1];
      }
      // Update headers from this row
      osHeaders = [];
      for (let col = 2; col < rowData.length; col++) {
        const header = rowData[col];
        if (header && typeof header === 'string' && header.trim()) {
          osHeaders.push({ col, name: cleanTargetName(header) });
        }
      }
      continue;
    }

    // Parse plugin name + version (keep plugin name as software, prefixed by Nik Collection)
    const { pluginName, version } = parseNikPluginRow(cellText, currentNikVersion);
    if (!pluginName) continue;
    const softwareName = buildNikSoftwareName(pluginName);

    for (const osHeader of osHeaders) {
      const cellValue = rowData[osHeader.col];
      const status = mapStatus(cellValue);

      if (osHeader.name) {
        records.push({
          software: softwareName,
          software_version: version || '',
          feature: 'os compatibility',
          compat_target: osHeader.name,
          status
        });
      }
    }
  }

  return records;
}

export async function POST(request: NextRequest) {
  // Authenticate user
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  let userEmail: string | null = null;
  if (token) {
    const { supabaseServer } = await import('@/lib/supabase/server');
    const { data: userData } = await supabaseServer.auth.getUser(token);
    userEmail = userData.user?.email || null;
  }

  const client = await pool.connect();

  try {
    // 1. Get files from FormData
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (files.length < 1) {
      return NextResponse.json(
        { error: 'Please upload at least 1 Excel file' },
        { status: 400 }
      );
    }

    // 2. Parse all Excel files
    const workbooks: { workbook: XLSX.WorkBook; filename: string }[] = [];
    for (const file of files) {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      workbooks.push({ workbook, filename: file.name });
    }

    // 3. Process known sheets across all workbooks and collect records
    const allRecords: CompatRecord[] = [];
    for (const { workbook } of workbooks) {
      for (const sheetName of workbook.SheetNames) {
        const kind = classifySheetName(sheetName);
        if (!kind) continue;

        switch (kind) {
          case 'dxo_windows':
          case 'dxo_macos':
            allRecords.push(...processOsSheet(workbook, sheetName, 'os compatibility'));
            break;
          case 'dxo_lr':
            allRecords.push(...processLrSheet(workbook));
            break;
          case 'dxo_host_apps':
            allRecords.push(...processHostAppsSheet(workbook));
            break;
          case 'dxo_dpr':
            allRecords.push(...processDprSheet(workbook));
            break;
          case 'nik_plugin':
            allRecords.push(...processNikPluginSheet(workbook, sheetName));
            break;
          case 'nik_mac':
          case 'nik_win':
            allRecords.push(...processNikMacWinSheet(workbook, sheetName));
            break;
        }
      }
    }

    // 4. Dedupe records by (software, version, feature, compat_target)
    const seen = new Set<string>();
    const uniqueRecords = allRecords.filter(record => {
      const key = `${record.software}|${record.software_version}|${record.feature}|${record.compat_target}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Filter out records with empty essential fields
    const validRecords = uniqueRecords.filter(
      r => r.software && r.compat_target && r.status
    );

    if (validRecords.length === 0) {
      return NextResponse.json(
        { error: 'No valid compatibility records found in the uploaded Excel files' },
        { status: 400 }
      );
    }

    // 5. Start transaction
    await client.query('BEGIN');

    // 6. Drop and recreate compatibility_records table
    await client.query('DROP TABLE IF EXISTS compatibility_records CASCADE');
    await client.query(`
      CREATE TABLE compatibility_records (
        id SERIAL PRIMARY KEY,
        software TEXT NOT NULL,
        software_version TEXT NOT NULL,
        feature TEXT NOT NULL,
        compat_target TEXT NOT NULL,
        status TEXT NOT NULL
      )
    `);
    await client.query('ALTER TABLE compatibility_records ENABLE ROW LEVEL SECURITY');
    await client.query(`
      CREATE POLICY "Allow public read access on compatibility_records"
      ON compatibility_records FOR SELECT
      USING (true)
    `);

    // 7. Insert records in batches
    const batchSize = 100;
    for (let i = 0; i < validRecords.length; i += batchSize) {
      const batch = validRecords.slice(i, i + batchSize);
      const values = batch.map(record =>
        `(${escapeValue(record.software)}, ${escapeValue(record.software_version)}, ${escapeValue(record.feature)}, ${escapeValue(record.compat_target)}, ${escapeValue(record.status)})`
      ).join(',\n');

      await client.query(`
        INSERT INTO compatibility_records (software, software_version, feature, compat_target, status)
        VALUES ${values}
      `);
    }

    // 8. Create index for faster queries
    await client.query(`
      CREATE INDEX idx_compatibility_software ON compatibility_records (software, software_version);
      CREATE INDEX idx_compatibility_feature ON compatibility_records (feature);
      CREATE INDEX idx_compatibility_target ON compatibility_records (compat_target);
    `);

    // 9. Commit transaction
    await client.query('COMMIT');

    const updatedAt = new Date().toISOString();

    // 10. Save metadata to software_source_metadata
    await client.query(`
      INSERT INTO software_source_metadata
        (last_updated, records_count, records_curated_count, uploaded_by, filename)
      VALUES ($1, $2, $3, $4, $5)
    `, [updatedAt, allRecords.length, validRecords.length, userEmail, files.map(f => f.name).join(', ')])

    // 11. Return success with counts
    return NextResponse.json({
      success: true,
      records: allRecords.length,
      recordsCurated: validRecords.length,
      updatedAt
    });

  } catch (error) {
    // Rollback on error
    await client.query('ROLLBACK');
    console.error('Upload error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      details: String(error)
    }, { status: 500 });
  } finally {
    client.release();
  }
}
