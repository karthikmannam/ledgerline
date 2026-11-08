import { getCsrfToken } from '@/lib/csrf';
import type { ApiErrorDetail } from '@/types/api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(detail: ApiErrorDetail, status: number) {
    super(detail.message || `API error: ${detail.code}`);
    this.name = 'ApiError';
    this.code = detail.code;
    this.status = status;
  }
}

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | undefined | null>;
}

export async function apiClient<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});

  // Generate a random UUID request ID for traceability
  if (!headers.has('x-request-id') && typeof crypto !== 'undefined' && crypto.randomUUID) {
    headers.set('x-request-id', crypto.randomUUID());
  }

  // Set Content-Type for JSON body
  if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Attach CSRF token on mutating operations
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers.set('x-csrf-token', csrfToken);
    }
  }

  // Build query string
  let url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  if (options.params) {
    const searchParams = new URLSearchParams();
    for (const [key, val] of Object.entries(options.params)) {
      if (val !== undefined && val !== null) {
        searchParams.append(key, String(val));
      }
    }
    const queryString = searchParams.toString();
    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }
  }

  const response = await fetch(url, {
    ...options,
    method,
    headers,
    credentials: 'include', // CRITICAL: send HttpOnly session cookie
  });

  // Handle empty responses (204 No Content)
  if (response.status === 204) {
    return {} as T;
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const errorBody = body as { error?: ApiErrorDetail } | null;
    const detail: ApiErrorDetail = errorBody?.error ?? {
      code: `HTTP_${response.status}`,
      message: response.statusText || 'Request failed',
    };
    throw new ApiError(detail, response.status);
  }

  return body as T;
}
