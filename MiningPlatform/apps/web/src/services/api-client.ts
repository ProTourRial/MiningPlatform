/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export class ApiRequestError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function execute(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init?.headers,
    },
  });
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response = await execute(path, init);
  const refreshExcluded = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/verify-email', '/auth/forgot-password', '/auth/reset-password'];
  if (response.status === 401 && !refreshExcluded.includes(path)) {
    const refreshed = await execute('/auth/refresh', { method: 'POST', body: '{}' });
    if (refreshed.ok) response = await execute(path, init);
  }

  if (!response.ok) {
    let detail = `API request failed with status ${response.status}`;
    try {
      const payload = await response.json() as { message?: string | string[] };
      if (payload.message) detail = Array.isArray(payload.message) ? payload.message.join(', ') : payload.message;
    } catch {
      // Preserve the status-based message when the response is not JSON.
    }
    throw new ApiRequestError(response.status, detail);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
