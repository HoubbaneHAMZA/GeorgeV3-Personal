import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Create a server-side Supabase client
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const supabaseKey = serviceRoleKey || anonKey;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function GET() {
  try {
    const supabase = getSupabaseClient();

    // Debug: Check what Supabase URL we're connecting to
    console.log('[FAQ API] Using Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
    console.log('[FAQ API] Has service role key:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Fetch all QAIs
    const { data: qaiData, error: qaiError } = await supabase
      .from('dxo_qai_content_hashes')
      .select('doc_id, exact_content, cluster_id, faq_ids, ticket_ids, faq_count, ticket_count, created_at, applicable_combinations, qai_age')
      .order('created_at', { ascending: false })
      .limit(500);

    if (qaiError) {
      console.error('[FAQ API] QAI fetch error:', qaiError);
      return NextResponse.json({ error: qaiError.message }, { status: 500 });
    }

    console.log('[FAQ API] QAIs count:', qaiData?.length || 0);
    if (qaiData && qaiData.length > 0) {
      console.log('[FAQ API] First QAI doc_id:', qaiData[0].doc_id, 'qai_age:', qaiData[0].qai_age);
    }

    return NextResponse.json({
      qaiItems: qaiData || [],
    });
  } catch (err) {
    console.error('[FAQ API] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch FAQ data' }, { status: 500 });
  }
}
