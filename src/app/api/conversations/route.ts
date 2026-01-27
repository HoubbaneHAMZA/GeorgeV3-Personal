const SUPABASE_ENDPOINT = 'https://oqwokjqdjybzoajpbqtq.supabase.co/functions/v1/conversations';

export const runtime = 'nodejs';

async function verifyAuth(request: Request): Promise<{ userId: string; userEmail: string } | Response> {
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
  return { userId: userData.user.id, userEmail: userData.user.email || '' };
}

function getAnonKey(): string | Response {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    return Response.json({ error: 'NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured.' }, { status: 500 });
  }
  return anonKey;
}

// GET /api/conversations - List user's conversations
export async function GET(request: Request) {
  const authResult = await verifyAuth(request);
  if (authResult instanceof Response) return authResult;

  const anonKey = getAnonKey();
  if (anonKey instanceof Response) return anonKey;

  const { searchParams } = new URL(request.url);
  const limit = searchParams.get('limit') || '50';
  const cursor = searchParams.get('cursor') || '';
  const includeArchived = searchParams.get('include_archived') || 'false';

  const params = new URLSearchParams();
  params.set('limit', limit);
  if (cursor) params.set('cursor', cursor);
  if (includeArchived === 'true') params.set('include_archived', 'true');

  const response = await fetch(`${SUPABASE_ENDPOINT}?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'x-user-id': authResult.userId,
      'x-user-email': authResult.userEmail
    }
  });

  const responseBody = await response.text();
  return new Response(responseBody, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'application/json; charset=utf-8'
    }
  });
}

// POST /api/conversations - Create new conversation
export async function POST(request: Request) {
  const authResult = await verifyAuth(request);
  if (authResult instanceof Response) return authResult;

  const anonKey = getAnonKey();
  if (anonKey instanceof Response) return anonKey;

  const body = await request.json();

  const response = await fetch(SUPABASE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'x-user-id': authResult.userId,
      'x-user-email': authResult.userEmail
    },
    body: JSON.stringify(body)
  });

  const responseBody = await response.text();
  return new Response(responseBody, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'application/json; charset=utf-8'
    }
  });
}
