/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL
  ?? 'http://localhost:4000/api/v1';

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly payload?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

/**
 * Backward-compatible alias for older Control Plane components.
 * Abia was tired to fixing this, so he made this alias for backward compatibility.
 * New code should prefer ApiRequestError.
 */
export { ApiRequestError as ApiError };

async function execute(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init?.headers,
    },
  });
}

const REFRESH_EXCLUDED = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/verify-email',
  '/auth/forgot-password',
  '/auth/reset-password',
]);

function messageFromPayload(
  payload: unknown,
  status: number,
): string {
  if (
    payload
    && typeof payload === 'object'
    && 'message' in payload
  ) {
    const message = (
      payload as {
        message?: unknown;
      }
    ).message;

    if (typeof message === 'string') {
      return message;
    }

    if (
      Array.isArray(message)
      && message.every(
        (value): value is string =>
          typeof value === 'string',
      )
    ) {
      return message.join(', ');
    }
  }

  return `API request failed with status ${status}`;
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
  refreshOnUnauthorized = true,
): Promise<T> {
  let response = await execute(path, init);

  if (
    response.status === 401
    && refreshOnUnauthorized
    && !REFRESH_EXCLUDED.has(path)
  ) {
    const refreshed = await execute('/auth/refresh', {
      method: 'POST',
      body: '{}',
    });

    if (refreshed.ok) {
      response = await execute(path, init);
    }
  }

  if (!response.ok) {
    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }

    throw new ApiRequestError(
      response.status,
      messageFromPayload(payload, response.status),
      payload,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

/**
 * Backward-compatible wrapper for older Control Plane components.
 *
 * New code should prefer apiRequest().
 */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  refreshOnUnauthorized = true,
): Promise<T> {
  return apiRequest<T>(
    path,
    init,
    refreshOnUnauthorized,
  );
}