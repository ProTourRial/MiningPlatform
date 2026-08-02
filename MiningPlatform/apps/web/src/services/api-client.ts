/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly payload?: unknown) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, allowRefresh = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: 'include' });
  if (response.status === 401 && allowRefresh && !path.startsWith('/auth/')) {
    const refreshed = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      credentials: 'include',
    });
    if (refreshed.ok) return apiFetch<T>(path, init, false);
  }
  const payload = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'message' in payload
      ? String((payload as { message: unknown }).message)
      : `API request failed (${response.status})`;
    throw new ApiError(response.status, message, payload);
  }
  return payload as T;
}
