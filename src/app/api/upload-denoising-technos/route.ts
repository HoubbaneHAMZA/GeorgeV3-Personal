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

// Parse software name and version from strings like "DxO PureRAW 5.5" or "DxO PhotoLab 9.2"
function parseSoftware(text: string): { name: string; version: string } {
  if (!text || typeof text !== 'string') {
    return { name: '', version: '' };
  }

  const cleaned = text.trim().replace(/\s+/g, ' ');

  // Handle "DxO PhotoLab Essential" (no version)
  if (/^DxO\s+PhotoLab\s+Essential$/i.test(cleaned)) {
    return { name: 'DxO PhotoLab Essential', version: '' };
  }

  // Handle DxO products: "DxO PureRAW 5.5", "DxO PhotoLab 9.2"
  const dxoMatch = cleaned.match(/^(DxO\s+\w+(?:\s+\w+)?)\s+([0-9]+(?:\.[0-9]+)*)$/i);
  if (dxoMatch) {
    return { name: dxoMatch[1].trim(), version: dxoMatch[2].trim() };
  }

  // Fallback: try to split on last space-followed-by-number
  const fallbackMatch = cleaned.match(/^(.+?)\s+(\d+(?:\.\d+)?)$/);
  if (fallbackMatch) {
    return { name: fallbackMatch[1].trim(), version: fallbackMatch[2] };
  }

  return { name: cleaned, version: '' };
}

// Map status values from Excel to database format
function mapStatus(value: unknown): string {
  if (value === null || value === undefined) return 'not compatible';

  const str = String(value).trim();

  // Check marks (various unicode variants) - means compatible with BOTH Bayer and X-Trans
  if (str === '✓' || str === '✔' || str === '✅' || str.toLowerCase() === 'yes') {
    return 'compatible: Bayer + X-Trans';
  }

  // X marks (various unicode variants)
  if (str === '✕' || str === '✗' || str === '×' || str === '❌' || str.toLowerCase() === 'no') {
    return 'not compatible';
  }

  // Empty or whitespace only
  if (!str || str === '-' || str === '—') {
    return 'not compatible';
  }

  // Sensor-specific compatibility with fuzzy matching
  const lowerStr = str.toLowerCase().replace(/[\s\-_]/g, ''); // normalize: remove spaces, hyphens, underscores

  // X-Trans variations: "X-Trans", "XTrans", "X Trans", "x-trans", "xtrans", "X_Trans", etc.
  if (lowerStr.includes('xtrans') || lowerStr.includes('xtrns') || /^x[\s\-_]?trans$/i.test(str)) {
    return 'compatible: X-Trans only';
  }

  // Bayer variations: "Bayer", "bayer", "BAYER", "Baer" (typo), etc.
  if (lowerStr.includes('bayer') || lowerStr === 'baer' || lowerStr === 'baeyr') {
    return 'compatible: Bayer only';
  }

  // Keep other text values as-is
  return str;
}

// Type for a denoising compatibility record
interface DenoisingRecord {
  name: string;           // Software name (e.g., "DxO PureRAW") or capability (e.g., "CPU")
  version: string;        // Version for software (e.g., "5.5"), empty for capabilities
  denoising_tech: string;
  status: string;
  record_type: 'software' | 'capability';
}

// Known capability row names (case-insensitive matching)
const CAPABILITY_NAMES = ['cpu', 'gpu', 'bayer', 'xtrans', 'jpeg', 'raw'];

// Process the English sheet from the denoising technologies Excel file
function processEnglishSheet(workbook: XLSX.WorkBook): DenoisingRecord[] {
  const sheet = workbook.Sheets['EN'];
  if (!sheet) {
    throw new Error('Sheet "EN" not found in the Excel file');
  }

  const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
  const records: DenoisingRecord[] = [];

  if (data.length < 2) return [];

  // Row 1 (index 1) has denoising technology headers in columns D onwards (index 3+)
  const headerRow = data[1] as unknown[];
  const techHeaders: { col: number; name: string }[] = [];

  for (let col = 3; col < headerRow.length; col++) {
    const header = headerRow[col];
    if (header && typeof header === 'string' && header.trim()) {
      techHeaders.push({ col, name: header.trim() });
    }
  }

  if (techHeaders.length === 0) {
    throw new Error('No denoising technology headers found in row 2');
  }

  // Process data rows (row 2 onwards = index 2+)
  for (let row = 2; row < data.length; row++) {
    const rowData = data[row] as unknown[];
    if (!rowData) continue;

    // Check if this is a capability row FIRST (CPU, GPU, Bayer, XTrans, Jpeg, Raw)
    // Capability rows have the capability name in column C (index 2) and column B is empty
    const capabilityCell = rowData[2];
    const isCapabilityRow = capabilityCell && typeof capabilityCell === 'string' &&
      CAPABILITY_NAMES.includes(capabilityCell.trim().toLowerCase());

    if (isCapabilityRow) {
      // Capability row: software = capability name, no version
      const capabilityName = (capabilityCell as string).trim();

      for (const techHeader of techHeaders) {
        const cellValue = rowData[techHeader.col];
        const status = mapStatus(cellValue);

        records.push({
          name: capabilityName,
          version: '',
          denoising_tech: techHeader.name,
          status,
          record_type: 'capability'
        });
      }
    } else {
      // Software row: check column B for DxO product name
      const softwareCell = rowData[1];
      if (!softwareCell || typeof softwareCell !== 'string') continue;

      const cellText = softwareCell.trim();
      if (!cellText || !cellText.toLowerCase().includes('dxo')) continue;

      // Parse name and version
      const { name, version } = parseSoftware(cellText);
      if (!name) continue;

      for (const techHeader of techHeaders) {
        const cellValue = rowData[techHeader.col];
        const status = mapStatus(cellValue);

        records.push({
          name: name,
          version: version,
          denoising_tech: techHeader.name,
          status,
          record_type: 'software'
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
    // 1. Get file from FormData
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'Please upload an Excel file' },
        { status: 400 }
      );
    }

    // 2. Parse the Excel file
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });

    // 3. Process the EN sheet and collect records
    const allRecords = processEnglishSheet(workbook);

    // 4. Dedupe records by (name, version, denoising_tech, record_type)
    const seen = new Set<string>();
    const uniqueRecords = allRecords.filter(record => {
      const key = `${record.name}|${record.version}|${record.denoising_tech}|${record.record_type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Filter out records with empty essential fields
    const validRecords = uniqueRecords.filter(
      r => r.name && r.denoising_tech && r.status
    );

    if (validRecords.length === 0) {
      return NextResponse.json(
        { error: 'No valid denoising compatibility records found in the uploaded Excel file' },
        { status: 400 }
      );
    }

    // 5. Start transaction
    await client.query('BEGIN');

    // 6. Drop and recreate denoising_technos_compatibility table
    await client.query('DROP TABLE IF EXISTS denoising_technos_compatibility CASCADE');
    await client.query(`
      CREATE TABLE denoising_technos_compatibility (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        denoising_tech TEXT NOT NULL,
        status TEXT NOT NULL,
        record_type TEXT NOT NULL DEFAULT 'software'
      )
    `);
    await client.query('ALTER TABLE denoising_technos_compatibility ENABLE ROW LEVEL SECURITY');
    await client.query(`
      CREATE POLICY "Allow public read access on denoising_technos_compatibility"
      ON denoising_technos_compatibility FOR SELECT
      USING (true)
    `);

    // 7. Insert records in batches
    const batchSize = 100;
    for (let i = 0; i < validRecords.length; i += batchSize) {
      const batch = validRecords.slice(i, i + batchSize);
      const values = batch.map(record =>
        `(${escapeValue(record.name)}, ${escapeValue(record.version)}, ${escapeValue(record.denoising_tech)}, ${escapeValue(record.status)}, ${escapeValue(record.record_type)})`
      ).join(',\n');

      await client.query(`
        INSERT INTO denoising_technos_compatibility (name, version, denoising_tech, status, record_type)
        VALUES ${values}
      `);
    }

    // 8. Create indexes for faster queries
    await client.query(`
      CREATE INDEX idx_denoising_name ON denoising_technos_compatibility (name, version);
      CREATE INDEX idx_denoising_tech ON denoising_technos_compatibility (denoising_tech);
      CREATE INDEX idx_denoising_type ON denoising_technos_compatibility (record_type);
    `);

    // 9. Commit transaction
    await client.query('COMMIT');

    const updatedAt = new Date().toISOString();

    // 10. Create metadata table if not exists and save metadata
    await client.query(`
      CREATE TABLE IF NOT EXISTS denoising_technos_source_metadata (
        id SERIAL PRIMARY KEY,
        last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        records_count INTEGER NOT NULL DEFAULT 0,
        uploaded_by TEXT,
        filename TEXT
      )
    `);
    await client.query('ALTER TABLE denoising_technos_source_metadata ENABLE ROW LEVEL SECURITY');
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'denoising_technos_source_metadata' AND policyname = 'Allow public read access on denoising_technos_source_metadata'
        ) THEN
          CREATE POLICY "Allow public read access on denoising_technos_source_metadata"
          ON denoising_technos_source_metadata FOR SELECT
          USING (true);
        END IF;
      END $$;
    `);
    await client.query(`
      INSERT INTO denoising_technos_source_metadata
        (last_updated, records_count, uploaded_by, filename)
      VALUES ($1, $2, $3, $4)
    `, [updatedAt, validRecords.length, userEmail, file.name]);

    // 11. Return success with counts
    return NextResponse.json({
      success: true,
      records: validRecords.length,
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
