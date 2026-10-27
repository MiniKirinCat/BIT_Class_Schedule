// frontend/src/data/__tests__/local.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../local';

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('local API client', () => {
  it('loads status through the same-origin API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ configured: true, version: '0.1.0' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.status()).resolves.toEqual({
      configured: true,
      version: '0.1.0',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/status',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  it('posts sync through the same-origin API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ status: 'success', change_count: 0 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await api.sync();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/sync',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('turns API errors into a readable ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(jsonResponse({ detail: '请等待 5 分钟后再同步' }, 429)),
      ),
    );

    await expect(api.sync()).rejects.toThrow('请等待 5 分钟后再同步');
    try {
      await api.sync();
    } catch (caught) {
      expect(caught).toBeInstanceOf(ApiError);
      expect((caught as ApiError).status).toBe(429);
    }
  });
});
