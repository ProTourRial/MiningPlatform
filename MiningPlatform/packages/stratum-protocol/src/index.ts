export interface StratumRequest {
  id: string | number | null;
  method: string;
  params: unknown[];
}

export interface StratumResponse {
  id: string | number | null;
  result: unknown;
  error: null | [number, string, unknown?];
}

export function parseStratumLine(line: string): StratumRequest {
  const value = JSON.parse(line) as Partial<StratumRequest>;
  if (typeof value.method !== 'string' || !Array.isArray(value.params)) {
    throw new Error('Invalid Stratum request');
  }
  return {
    id: value.id ?? null,
    method: value.method,
    params: value.params,
  };
}

export function serializeStratumResponse(response: StratumResponse): string {
  return `${JSON.stringify(response)}\n`;
}
