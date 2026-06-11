export interface HttpRequestContext { ip?: string; requestId?: string; origin?: string; }
export function headersFromRecord(headers: Record<string, unknown>): Headers { const out = new Headers(); for (const [key, value] of Object.entries(headers)) { if (value) out.set(key, Array.isArray(value) ? value.join(',') : String(value)); } return out; }
