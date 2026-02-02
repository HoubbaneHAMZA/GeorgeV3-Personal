import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export async function GET() {
  const client = await pool.connect();

  try {
    // Check if the metadata table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'denoising_technos_source_metadata'
      )
    `);

    if (!tableCheck.rows[0].exists) {
      return NextResponse.json({ exists: false });
    }

    // Get the most recent metadata record
    const result = await client.query(`
      SELECT
        last_updated,
        records_count,
        uploaded_by,
        filename
      FROM denoising_technos_source_metadata
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
