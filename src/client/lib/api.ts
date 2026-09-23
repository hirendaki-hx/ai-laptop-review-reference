import {
  SystemStatusResponse,
  ExtractionJob,
  ConfigurationMatchResult,
  Configuration,
  GeminiModelInfo,
  ScoringProfile,
  ConfigurationScore,
  ScoringMetricDefinition,
} from '../../shared/types/index.ts';

const ADMIN_KEY_STORAGE = 'ai_laptop_review_admin_key';
const AUTH_TOKEN_STORAGE = 'ai_laptop_review_auth_token';

export function getStoredAdminKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(ADMIN_KEY_STORAGE) || sessionStorage.getItem(ADMIN_KEY_STORAGE) || 'v2-dev-admin-key';
}

export function setStoredAdminKey(key: string, persist: boolean = true): void {
  if (typeof window === 'undefined') return;
  if (persist) {
    localStorage.setItem(ADMIN_KEY_STORAGE, key.trim());
  } else {
    sessionStorage.setItem(ADMIN_KEY_STORAGE, key.trim());
  }
}

export function getStoredAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(AUTH_TOKEN_STORAGE) || sessionStorage.getItem(AUTH_TOKEN_STORAGE);
}

export function setStoredAuthToken(token: string, persist: boolean = true): void {
  if (typeof window === 'undefined') return;
  if (persist) {
    localStorage.setItem(AUTH_TOKEN_STORAGE, token.trim());
  } else {
    sessionStorage.setItem(AUTH_TOKEN_STORAGE, token.trim());
  }
}

export function removeStoredAuthToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_TOKEN_STORAGE);
  sessionStorage.removeItem(AUTH_TOKEN_STORAGE);
}

export async function fetchApi<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const authToken = getStoredAuthToken();
  if (authToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }

  const adminKey = getStoredAdminKey();
  if (adminKey && !headers.has('x-admin-key')) {
    headers.set('x-admin-key', adminKey);
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = data?.error?.message || response.statusText || 'API request failed';
    const code = data?.error?.code || 'API_ERROR';
    const err: any = new Error(errorMsg);
    err.code = code;
    err.status = response.status;
    err.details = data?.error?.details;
    throw err;
  }

  return data as T;
}

export const api = {
  // Status & Health
  getStatus: () => fetchApi<SystemStatusResponse>('/api/status'),
  getHealth: () => fetchApi<{ status: string }>('/api/health'),
  getSchemaDiagnostics: () => fetchApi<any>('/api/database/schema'),

  // Authentication
  getMe: () => fetchApi<{ authenticated: boolean; user: any; profile: any }>('/api/me'),
  login: (email: string, password: string) =>
    fetchApi<{ session: any; user: any; profile: any }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  register: (email: string, password: string) =>
    fetchApi<{ session: any; user: any; profile: any; message: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => fetchApi<{ success: boolean }>('/api/auth/logout', { method: 'POST' }),

  // User Administration
  getAdminUsers: () => fetchApi<{ users: any[] }>('/api/admin/users'),
  updateUserRole: (userId: string, role: string) =>
    fetchApi<{ profile: any }>(`/api/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
  updateUserStatus: (userId: string, is_active: boolean) =>
    fetchApi<{ profile: any }>(`/api/admin/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active }),
    }),

  // Gemini Models
  getModels: () => fetchApi<{ activeModel: string; models: GeminiModelInfo[] }>('/api/gemini/models'),
  testModel: (modelId: string) =>
    fetchApi<{
      modelId: string;
      status: string;
      latencyMs?: number;
      testedAt: string;
      error?: string;
    }>(`/api/gemini/models/${encodeURIComponent(modelId)}/test`, { method: 'POST' }),
  setActiveModel: (model: string) =>
    fetchApi<{ success: boolean; currentModel: string; message: string }>('/api/gemini/model', {
      method: 'POST',
      body: JSON.stringify({ model }),
    }),

  // Extraction
  extractVideo: (youtubeUrl: string, model?: string) =>
    fetchApi<{ jobId: string; status: string; videoId: string; message: string }>('/api/extract', {
      method: 'POST',
      body: JSON.stringify({ youtube_url: youtubeUrl, model }),
    }),

  getJob: (jobId: string) => fetchApi<ExtractionJob>(`/api/extract/${jobId}`),

  resumeJob: (jobId: string) =>
    fetchApi<{ success: boolean; jobId: string; status: string }>(`/api/extract/${jobId}/resume`, {
      method: 'POST',
    }),

  getGeminiSchedulerStatus: () =>
    fetchApi<{
      model: string;
      isRateLimited: boolean;
      retryAfterSeconds: number;
      cooldownUntil: string | null;
      lastError: string | null;
    }>('/api/gemini/status'),

  getJobMatches: (jobId: string) =>
    fetchApi<{ jobId: string; matches: ConfigurationMatchResult[] }>(`/api/extract/${jobId}/matches`),

  commitJob: (jobId: string, payload: any) =>
    fetchApi<{ status: string; review_source_id: string; configuration_id: string }>(
      `/api/extract/${jobId}/commit`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  discardJob: (jobId: string) =>
    fetchApi<{ status: string }>(`/api/extract/${jobId}/discard`, {
      method: 'POST',
    }),

  // Jobs
  getJobs: () => fetchApi<{ jobs: ExtractionJob[] }>('/api/jobs'),
  retryJob: (jobId: string) =>
    fetchApi<{ status: string }>(`/api/jobs/${jobId}/retry`, { method: 'POST' }),
  deleteJob: (jobId: string) =>
    fetchApi<{ status: string }>(`/api/jobs/${jobId}`, { method: 'DELETE' }),

  // Laptops & Brands
  getBrands: () => fetchApi<{ brands: Array<{ id: string; name: string }> }>('/api/brands'),
  getLaptops: (params: { search?: string; brand?: string; page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.brand) q.set('brand', params.brand);
    if (params.page) q.set('page', String(params.page));
    if (params.limit) q.set('limit', String(params.limit));
    return fetchApi<{
      laptops: any[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>(`/api/laptops?${q.toString()}`);
  },
  getLaptop: (id: string) => fetchApi<any>(`/api/laptops/${id}`),
  deleteLaptop: (id: string) => fetchApi<{ status: string }>(`/api/laptops/${id}`, { method: 'DELETE' }),

  // Configurations & Compare
  getConfiguration: (id: string) => fetchApi<Configuration>(`/api/configurations/${id}`),
  getCompare: (ids: string[]) =>
    fetchApi<{ configurations: any[] }>(`/api/compare?ids=${ids.join(',')}`),

  // Scoring Endpoints (Public)
  getScoringProfiles: () => fetchApi<{ profiles: ScoringProfile[] }>('/api/scoring/profiles'),
  getScoringProfile: (profileKey: string) =>
    fetchApi<{ profile: ScoringProfile }>(`/api/scoring/profiles/${profileKey}`),
  getConfigurationScores: (configId: string) =>
    fetchApi<{ scores: ConfigurationScore[] }>(`/api/configurations/${configId}/scores`),
  getConfigurationScore: (configId: string, profileKey: string) =>
    fetchApi<{ score: ConfigurationScore }>(`/api/configurations/${configId}/scores/${profileKey}`),
  getScoringDiagnostics: () => fetchApi<any>('/api/scoring/diagnostics'),

  // Scoring Administration (Admin)
  getAdminMetrics: () => fetchApi<{ metrics: ScoringMetricDefinition[] }>('/api/admin/scoring/metrics'),
  saveAdminMetric: (metric: any) =>
    fetchApi<{ metric: ScoringMetricDefinition }>('/api/admin/scoring/metrics', {
      method: 'POST',
      body: JSON.stringify(metric),
    }),
  getAdminProfiles: () => fetchApi<{ profiles: ScoringProfile[] }>('/api/admin/scoring/profiles'),
  createProfileVersion: (profileId: string, payload: any) =>
    fetchApi<{ profile: ScoringProfile }>(`/api/admin/scoring/profiles/${profileId}/new-version`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  toggleProfileStatus: (profileId: string, is_active: boolean) =>
    fetchApi<{ success: boolean; is_active: boolean }>(`/api/admin/scoring/profiles/${profileId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active }),
    }),
  recalculateScores: (configuration_id?: string) =>
    fetchApi<{ success: boolean; message: string; scores?: any[] }>('/api/admin/scoring/recalculate', {
      method: 'POST',
      body: JSON.stringify({ configuration_id }),
    }),

  // Retail Preview
  previewRetailUrl: (url: string) =>
    fetchApi<{ result: any }>('/api/listings/preview', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),
};
