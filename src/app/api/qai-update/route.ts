const SUPABASE_ENDPOINT = 'https://oqwokjqdjybzoajpbqtq.supabase.co/functions/v1/qai-update';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { supabaseServer } = await import('@/lib/supabase/server');
  const { data: userData, error: userError } = await supabaseServer.auth.getUser(token);
  if (userError || !userData.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    return Response.json({ error: 'NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured.' }, { status: 500 });
  }

  const body = await request.text();
  const response = await fetch(SUPABASE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'x-user-id': userData.user.id,
      'x-user-email': userData.user.email || ''
    },
    body
  });

  const result = await response.json();
  return Response.json(result, { status: response.status });
}

// Status polling endpoint
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { supabaseServer } = await import('@/lib/supabase/server');
  const { data: userData, error: userError } = await supabaseServer.auth.getUser(token);
  if (userError || !userData.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    return Response.json({ error: 'NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured.' }, { status: 500 });
  }

  // Get job_id from query params
  const url = new URL(request.url);
  const jobId = url.searchParams.get('job_id');
  if (!jobId) {
    return Response.json({ error: 'job_id is required' }, { status: 400 });
  }

  const response = await fetch(`${SUPABASE_ENDPOINT}/status/${jobId}`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  });

  const result = await response.json();
  return Response.json(result, { status: response.status });
}
