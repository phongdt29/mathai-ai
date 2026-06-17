const assert = require('node:assert/strict');
const { afterEach, describe, test } = require('node:test');

const originalNodeEnv = process.env.NODE_ENV;
const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;
const originalBackendApiUrl = process.env.BACKEND_API_URL;

const reloadNextConfig = () => {
  delete require.cache[require.resolve('./next.config.js')];
  delete require.cache[require.resolve('./env-config.cjs')];
  return require('./next.config.js');
};

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalApiUrl === undefined) {
    delete process.env.NEXT_PUBLIC_API_URL;
  } else {
    process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
  }
  if (originalBackendApiUrl === undefined) {
    delete process.env.BACKEND_API_URL;
  } else {
    process.env.BACKEND_API_URL = originalBackendApiUrl;
  }
});

describe('Next.js API URL config', () => {
  test('uses shared production guard for rewrite destination normalization', async () => {
    process.env.NODE_ENV = 'development';
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3001/api/';

    const nextConfig = reloadNextConfig();
    const rewrites = await nextConfig.rewrites();

    assert.equal(rewrites[0].destination, 'http://localhost:3001/api/:path*');
  });

  test('defaults development rewrite destination to backend when public API env is missing', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.NEXT_PUBLIC_API_URL;
    delete process.env.BACKEND_API_URL;

    const nextConfig = reloadNextConfig();
    const rewrites = await nextConfig.rewrites();

    assert.equal(rewrites[0].destination, 'http://localhost:3001/api/:path*');
  });

  test('uses explicit server API URL for development rewrite destination', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.NEXT_PUBLIC_API_URL;
    process.env.BACKEND_API_URL = 'http://127.0.0.1:3001/api/';

    const nextConfig = reloadNextConfig();
    const rewrites = await nextConfig.rewrites();

    assert.equal(rewrites[0].destination, 'http://127.0.0.1:3001/api/:path*');
  });

  test('fails clearly when production API URL is unsafe during config evaluation', () => {
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3001/api';

    assert.throws(
      () => reloadNextConfig(),
      /NEXT_PUBLIC_API_URL must not point to localhost in production/,
    );
  });
});
