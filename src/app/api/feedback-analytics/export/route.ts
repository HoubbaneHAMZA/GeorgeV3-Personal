const SUPABASE_ENDPOINT = 'https://oqwokjqdjybzoajpbqtq.supabase.co/functions/v1/feedback-analytics';

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

// GET /api/feedback-analytics/export
export async function GET(request: Request) {
  const authResult = await verifyAuth(request);
  if (authResult instanceof Response) return authResult;

  const anonKey = getAnonKey();
  if (anonKey instanceof Response) return anonKey;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const format = searchParams.get('format') || 'json';
  const scope = searchParams.get('scope');

  const queryParams = new URLSearchParams();
  if (from) queryParams.set('from', from);
  if (to) queryParams.set('to', to);
  queryParams.set('format', format);
  if (scope) queryParams.set('scope', scope);

  const url = `${SUPABASE_ENDPOINT}/export${queryParams.toString() ? `?${queryParams}` : ''}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'x-user-id': authResult.userId
    }
  });

  const responseBody = await response.text();
  const contentType = response.headers.get('Content-Type') || 'application/json; charset=utf-8';
  const contentDisposition = response.headers.get('Content-Disposition');

  const headers: Record<string, string> = {
    'Content-Type': contentType
  };

  if (contentDisposition) {
    headers['Content-Disposition'] = contentDisposition;
  }

  return new Response(responseBody, {
    status: response.status,
    headers
  });
}
