const DEFAULT_PUBLIC_API_URL = '/api';
const DEFAULT_REWRITE_API_URL = 'http://localhost:3001/api';

function getEnvValue(env, key) {
  return env && Object.prototype.hasOwnProperty.call(env, key)
    ? env[key]
    : process.env[key];
}

function normalizePublicApiUrl(options = {}) {
  const nodeEnv = options.nodeEnv || getEnvValue(options.env, 'NODE_ENV') || process.env.NODE_ENV || 'development';
  const rawValue = options.value ?? getEnvValue(options.env, 'NEXT_PUBLIC_API_URL');
  const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue;

  if (!value) {
    if (nodeEnv === 'production') {
      throw new Error('NEXT_PUBLIC_API_URL is required in production and must be an absolute, non-localhost URL.');
    }
    return DEFAULT_PUBLIC_API_URL;
  }

  const normalized = value.replace(/\/+$/, '') || '/';

  if (nodeEnv === 'production') {
    let parsed;
    try {
      parsed = new URL(normalized);
    } catch {
      throw new Error('NEXT_PUBLIC_API_URL must be an absolute URL in production.');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('NEXT_PUBLIC_API_URL must use http or https in production.');
    }

    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.endsWith('.localhost')
    ) {
      throw new Error('NEXT_PUBLIC_API_URL must not point to localhost in production.');
    }
  }

  return normalized;
}

function normalizeRewriteApiUrl(options = {}) {
  const nodeEnv = options.nodeEnv || getEnvValue(options.env, 'NODE_ENV') || process.env.NODE_ENV || 'development';
  const rawValue =
    options.value ??
    getEnvValue(options.env, 'BACKEND_API_URL') ??
    getEnvValue(options.env, 'NEXT_PUBLIC_API_URL');

  return normalizePublicApiUrl({
    nodeEnv,
    value: rawValue ?? DEFAULT_REWRITE_API_URL,
  });
}

function getPublicApiUrl() {
  return normalizePublicApiUrl();
}

function getRewriteApiUrl() {
  return normalizeRewriteApiUrl();
}

module.exports = {
  DEFAULT_PUBLIC_API_URL,
  DEFAULT_REWRITE_API_URL,
  getPublicApiUrl,
  getRewriteApiUrl,
  normalizePublicApiUrl,
  normalizeRewriteApiUrl,
};
