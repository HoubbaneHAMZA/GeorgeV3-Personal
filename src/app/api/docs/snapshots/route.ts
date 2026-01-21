import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: 'Missing Supabase environment variables.' }, { status: 500 });
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/docs-refresh`, {
    method: 'GET',
    headers: {
      apikey: supabaseAnonKey,
      authorization: `Bearer ${supabaseAnonKey}`
    },
    cache: 'no-store'
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    return NextResponse.json(
      { error: data?.error || 'Failed to load snapshots.' },
      { status: response.status }
    );
  }

  return NextResponse.json(data, {
    headers: {
      'cache-control': 'no-store'
    }
  });
}
