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

// POST /api/agent-interactions - Create new interaction
export async function POST(request: Request) {
  const authResult = await verifyAuth(request);
  if (authResult instanceof Response) return authResult;

  const anonKey = getAnonKey();
  if (anonKey instanceof Response) return anonKey;

  const body = await request.json();
  // Add user_id from auth
  body.user_id = authResult.userId;

  const response = await fetch(SUPABASE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`
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

// GET /api/agent-interactions?ids=id1,id2,id3 - Fetch feedback by IDs
// GET /api/agent-interactions (no params) - Redirects to /tags for backwards compatibility
export async function GET(request: Request) {
  const authResult = await verifyAuth(request);
  if (authResult instanceof Response) return authResult;

  const anonKey = getAnonKey();
  if (anonKey instanceof Response) return anonKey;

  const { searchParams } = new URL(request.url);
  const ids = searchParams.get('ids');

  // If ids provided, fetch feedback for those interactions
  if (ids) {
    const response = await fetch(`${SUPABASE_ENDPOINT}?ids=${ids}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`
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

  // Default: fetch tags (backwards compatibility)
  const response = await fetch(`${SUPABASE_ENDPOINT}/tags`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`
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
