const getToken = () => {
  try {
    return localStorage.getItem('retailos_token') || localStorage.getItem('token') || '';
  } catch {
    return '';
  }
};

export function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function apiFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      ...authHeaders(),
      ...options.headers,
    },
  });
}

/**
 * Fetch JSON from an API endpoint and guarantee an array result.
 * Returns [] on auth errors, network failures, or non-array responses.
 */
export async function apiFetchArray(url, options = {}) {
  try {
    const res = await apiFetch(url, options);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
