import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { Pool } from 'pg';

// Create a connection pool using the DATABASE_URL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Sanitize column names for SQL (replace special chars, ensure valid identifiers)
function sanitizeColumnName(name: string): string {
  if (!name || typeof name !== 'string') return 'unnamed';
  // Replace problematic characters, keep alphanumeric, spaces, and some common chars
  return name.trim();
}

// Escape a value for SQL insertion
function escapeValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return 'NULL';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }
  // Escape single quotes by doubling them
  const str = String(value).replace(/'/g, "''");
  return `'${str}'`;
}

function normalizeSheetName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifySheetName(name: string): 'cameras' | 'lenses' | null {
  const norm = normalizeSheetName(name);
  if (norm.includes('camera')) return 'cameras';
  if (norm.includes('lens') || norm.includes('lenses')) return 'lenses';
  return null;
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
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // 2. Parse Excel with xlsx
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });

    // 3. Find cameras and lenses sheets by fuzzy name matching
    let camerasSheetName: string | null = null;
    let lensesSheetName: string | null = null;

    for (const sheetName of workbook.SheetNames) {
      const kind = classifySheetName(sheetName);
      if (kind === 'cameras' && !camerasSheetName) camerasSheetName = sheetName;
      if (kind === 'lenses' && !lensesSheetName) lensesSheetName = sheetName;
    }

    if (!camerasSheetName || !lensesSheetName) {
      return NextResponse.json({
        error: 'Could not detect cameras/lenses sheets by name. Use sheet names like "cameras", "planning cameras", "lenses", or "planning lenses".'
      }, { status: 400 });
    }

    const camerasSheet = workbook.Sheets[camerasSheetName];
    const lensesSheet = workbook.Sheets[lensesSheetName];

    const camerasData = XLSX.utils.sheet_to_json<Record<string, unknown>>(camerasSheet, { defval: null });
    const lensesData = XLSX.utils.sheet_to_json<Record<string, unknown>>(lensesSheet, { defval: null });

    if (camerasData.length === 0 || lensesData.length === 0) {
      return NextResponse.json({
        error: 'Excel file must have data in both sheets (cameras and lenses)'
      }, { status: 400 });
    }

    // 4. Get column names from the first row of each sheet
    const camerasColumns = Object.keys(camerasData[0]).map(sanitizeColumnName);
    const lensesColumns = Object.keys(lensesData[0]).map(sanitizeColumnName);

    // 5. Start transaction
    await client.query('BEGIN');

    // 6. Drop and recreate cameras table
    await client.query('DROP TABLE IF EXISTS cameras CASCADE');
    const createCamerasSQL = `
      CREATE TABLE cameras (
        ${camerasColumns.map(col => `"${col}" TEXT`).join(',\n        ')}
      )
    `;
    await client.query(createCamerasSQL);
    await client.query('ALTER TABLE cameras ENABLE ROW LEVEL SECURITY');

    // 7. Insert cameras data in batches
    const cameraBatchSize = 100;
    for (let i = 0; i < camerasData.length; i += cameraBatchSize) {
      const batch = camerasData.slice(i, i + cameraBatchSize);
      const values = batch.map(row => {
        const rowValues = camerasColumns.map(col => {
          const originalKey = Object.keys(row).find(k => sanitizeColumnName(k) === col);
          return escapeValue(originalKey ? row[originalKey] : null);
        });
        return `(${rowValues.join(', ')})`;
      }).join(',\n');

      const insertSQL = `
        INSERT INTO cameras (${camerasColumns.map(c => `"${c}"`).join(', ')})
        VALUES ${values}
      `;
      await client.query(insertSQL);
    }

    // 8. Drop and recreate lenses table
    await client.query('DROP TABLE IF EXISTS lenses CASCADE');
    const createLensesSQL = `
      CREATE TABLE lenses (
        ${lensesColumns.map(col => `"${col}" TEXT`).join(',\n        ')}
      )
    `;
    await client.query(createLensesSQL);
    await client.query('ALTER TABLE lenses ENABLE ROW LEVEL SECURITY');

    // 9. Insert lenses data in batches
    const lensesBatchSize = 100;
    for (let i = 0; i < lensesData.length; i += lensesBatchSize) {
      const batch = lensesData.slice(i, i + lensesBatchSize);
      const values = batch.map(row => {
        const rowValues = lensesColumns.map(col => {
          const originalKey = Object.keys(row).find(k => sanitizeColumnName(k) === col);
          return escapeValue(originalKey ? row[originalKey] : null);
        });
        return `(${rowValues.join(', ')})`;
      }).join(',\n');

      const insertSQL = `
        INSERT INTO lenses (${lensesColumns.map(c => `"${c}"`).join(', ')})
        VALUES ${values}
      `;
      await client.query(insertSQL);
    }

    // 10. Regenerate cameras_curated from cameras
    await client.query('DROP TABLE IF EXISTS cameras_curated');
    await client.query(`
      CREATE TABLE cameras_curated AS
      SELECT
        "Brand",
        "Model",
        "Sensor",
        "Mount",
        "Calibration type",
        "Customer status",
        "Start",
        "Engine Status",
        "CLSS package",
        "PL Version" AS "PhotoLab Version",
        "PL Support" AS "PhotoLab Support",
        "PR Version" AS "PureRaw Version",
        "PR Support" AS "PureRaw Support",
        "FP Version" AS "FilmPack Version",
        "FP Support" AS "FilmPack Support",
        "VP Version" AS "ViewPoint Version",
        "VP Support" AS "ViewPoint Support",
        "NPFX Version" AS "Nik Collection Version",
        "NPFX Support" AS "Nik Collection Support",
        "Support LR" AS "Lightroom Support",
        "Support C1",
        "Support On1"
      FROM cameras
      WHERE "Brand" IS NOT NULL OR "Model" IS NOT NULL
      ORDER BY "Brand", "Model"
    `);
    await client.query('ALTER TABLE cameras_curated ENABLE ROW LEVEL SECURITY');

    // 11. Regenerate lenses_curated from lenses
    await client.query('DROP TABLE IF EXISTS lenses_curated');
    await client.query(`
      CREATE TABLE lenses_curated AS
      SELECT
        "Release year",
        "Release Quarter",
        "RTM CLSS",
        "Brand",
        "Model",
        "Mount",
        "Nb calibration",
        "Lens Type",
        "Start",
        "Calibration ready",
        "Intermediate status",
        "Status",
        "C1"
      FROM lenses
      ORDER BY "Brand", "Model"
    `);
    await client.query('ALTER TABLE lenses_curated ENABLE ROW LEVEL SECURITY');

    // 12. Commit transaction
    await client.query('COMMIT');

    // 13. Get curated table counts
    const camerasCuratedCount = await client.query('SELECT COUNT(*) FROM cameras_curated');
    const lensesCuratedCount = await client.query('SELECT COUNT(*) FROM lenses_curated');

    const camerasCurated = parseInt(camerasCuratedCount.rows[0].count, 10);
    const lensesCurated = parseInt(lensesCuratedCount.rows[0].count, 10);
    const updatedAt = new Date().toISOString();

    // 14. Save metadata to cameras_lenses_source_metadata table
    await client.query(`
      INSERT INTO cameras_lenses_source_metadata
        (last_updated, cameras_count, lenses_count, cameras_curated_count, lenses_curated_count, uploaded_by, filename)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [updatedAt, camerasData.length, lensesData.length, camerasCurated, lensesCurated, userEmail, file.name]);

    // 15. Return success with counts
    return NextResponse.json({
      success: true,
      cameras: camerasData.length,
      lenses: lensesData.length,
      camerasCurated,
      lensesCurated,
      camerasColumns: camerasColumns.length,
      lensesColumns: lensesColumns.length,
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
