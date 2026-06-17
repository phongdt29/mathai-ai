import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  const { endpoint, apiKey, model, messages } = await req.json();

  if (!endpoint || !messages) {
    return new Response(JSON.stringify({ error: 'endpoint and messages are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const base = endpoint.replace(/\/+$/, '');
  const url = `${base}/chat/completions`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        messages,
        stream: true,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: `${res.status}: ${text}` }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Stream the response back to client
    return new Response(res.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Failed to connect' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
