const SUPABASE_ENDPOINT = 'https://oqwokjqdjybzoajpbqtq.supabase.co/functions/v1/agent-gateway';

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
      Accept: 'text/event-stream',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'x-user-id': userData.user.id,
      'x-user-email': userData.user.email || ''
    },
    body
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    }
  });
}
