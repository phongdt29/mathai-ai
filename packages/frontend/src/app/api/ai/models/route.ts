import { type NextRequest, NextResponse } from 'next/server';

const MODEL_FETCH_TIMEOUT_MS = 10_000;

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map((part) => Number(part));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }

  const [first, second] = parts;
  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254) ||
    first === 0
  );
}

function isUnsafeHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  const isIpv6 = normalized.includes(':');
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.startsWith('[') ||
    (isIpv6 &&
      (normalized === '::1' ||
        normalized.startsWith('fe80:') ||
        normalized.startsWith('fc') ||
        normalized.startsWith('fd'))) ||
    isPrivateIpv4(normalized)
  );
}

function normalizePublicModelsUrl(endpoint: unknown): URL {
  if (typeof endpoint !== 'string' || endpoint.trim().length === 0) {
    throw new Error('Endpoint is required');
  }

  const base = new URL(endpoint.trim());
  if (
    base.protocol !== 'https:' ||
    base.username ||
    base.password ||
    isUnsafeHostname(base.hostname)
  ) {
    throw new Error('Endpoint must be a public HTTPS endpoint');
  }

  base.pathname = `${base.pathname.replace(/\/+$/, '')}/models`;
  base.search = '';
  base.hash = '';
  return base;
}

export async function POST(req: NextRequest) {
  const { endpoint, apiKey } = await req.json();

  let url: URL;
  try {
    url = normalizePublicModelsUrl(endpoint);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid endpoint' },
      { status: 400 },
    );
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      MODEL_FETCH_TIMEOUT_MS,
    );
    const res = await fetch(url, {
      headers,
      signal: controller.signal,
    }).finally(() => {
      clearTimeout(timeout);
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Provider returned HTTP ${res.status}` },
        { status: 502 },
      );
    }
    const json = await res.json();
    return NextResponse.json(json);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch models' },
      { status: 502 },
    );
  }
}
