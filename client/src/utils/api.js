/**
 * Smart Shop API Client
 * Lightweight Axios-like fetch wrapper
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function request(endpoint, options = {}) {
  const token = localStorage.getItem('smartshop_token');
  const headers = {
    ...options.headers,
  };

  // If body is not FormData, default to application/json
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      localStorage.removeItem('smartshop_token');
      localStorage.removeItem('smartshop_user');
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }

    if (response.status === 204) {
      return null;
    }

    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      const errorMessage = data?.message || data?.error || (typeof data === 'string' ? data : `Request failed with status ${response.status}`);
      throw new ApiError(errorMessage, response.status, data);
    }

    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(error.message || 'Network connection failed', 0, null);
  }
}

export const api = {
  get: (url, params) => {
    let fullUrl = url;
    if (params) {
      const queryString = new URLSearchParams(
        Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== '')
      ).toString();
      if (queryString) {
        fullUrl += (url.includes('?') ? '&' : '?') + queryString;
      }
    }
    return request(fullUrl, { method: 'GET' });
  },

  post: (url, body) => {
    const isFormData = body instanceof FormData;
    return request(url, {
      method: 'POST',
      body: isFormData ? body : JSON.stringify(body),
    });
  },

  put: (url, body) => {
    const isFormData = body instanceof FormData;
    return request(url, {
      method: 'PUT',
      body: isFormData ? body : JSON.stringify(body),
    });
  },

  delete: (url) => {
    return request(url, { method: 'DELETE' });
  },
};

export default api;
