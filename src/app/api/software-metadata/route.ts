import { NextResponse } from 'next/server';
import { Pool } from 'pg';

// Prevent static prerendering during build
export const dynamic = 'force-dynamic';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export async function GET() {
  const client = await pool.connect();

  try {
    // Get the most recent metadata record
    const result = await client.query(`
      SELECT
        last_updated,
        records_count,
        records_curated_count,
        uploaded_by,
        filename
      FROM software_source_metadata
      ORDER BY last_updated DESC
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      return NextResponse.json({ exists: false });
    }

    const row = result.rows[0];
    return NextResponse.json({
      exists: true,
      records: row.records_count,
      recordsCurated: row.records_curated_count,
      updatedAt: row.last_updated,
      uploadedBy: row.uploaded_by,
      filename: row.filename
    });
  } catch (error) {
    console.error('Metadata fetch error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  } finally {
    client.release();
  }
}
