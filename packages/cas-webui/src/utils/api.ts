// API utility - uses VITE_API_URL for backend calls

export const API_URL = import.meta.env.VITE_API_URL || "";

/**
 * Make an authenticated API request
 */
export async function apiRequest(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<Response> {
  const url = `${API_URL}${path}`;
  const headers: HeadersInit = {
    ...options.headers,
  };

  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  return fetch(url, {
    ...options,
    headers,
  });
}

/**
 * Make an authenticated JSON API request
 */
export async function apiJsonRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const response = await apiRequest(path, options, token);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}
