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
        cameras_count,
        lenses_count,
        cameras_curated_count,
        lenses_curated_count,
        uploaded_by,
        filename
      FROM cameras_lenses_source_metadata
      ORDER BY last_updated DESC
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      return NextResponse.json({ exists: false });
    }

    const row = result.rows[0];
    return NextResponse.json({
      exists: true,
      cameras: row.cameras_count,
      lenses: row.lenses_count,
      camerasCurated: row.cameras_curated_count,
      lensesCurated: row.lenses_curated_count,
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
