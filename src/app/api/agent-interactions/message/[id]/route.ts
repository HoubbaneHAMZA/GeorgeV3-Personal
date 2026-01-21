const SUPABASE_ENDPOINT = 'https://oqwokjqdjybzoajpbqtq.supabase.co/functions/v1/agent-interactions';

export const runtime = 'nodejs';

async function verifyAuth(request: Request): Promise<{ userId: string } | Response> {
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
  return { userId: userData.user.id };
}

function getAnonKey(): string | Response {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    return Response.json({ error: 'NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured.' }, { status: 500 });
  }
  return anonKey;
}

// PATCH /api/agent-interactions/message/[id] - Update feedback for an interaction
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const authResult = await verifyAuth(request);
  if (authResult instanceof Response) return authResult;

  const anonKey = getAnonKey();
  if (anonKey instanceof Response) return anonKey;

  const body = await request.text();

  const response = await fetch(`${SUPABASE_ENDPOINT}/message/${params.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`
    },
    body
  });

  const responseBody = await response.text();
  return new Response(responseBody, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'application/json; charset=utf-8'
    }
  });
}
