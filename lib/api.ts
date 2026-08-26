const apiUrl = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
const ownerApiKey = process.env.NEXT_PUBLIC_OWNER_API_KEY || '';

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!apiUrl) throw new Error('NEXT_PUBLIC_API_URL is not configured');

  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(ownerApiKey ? { 'x-owner-api-key': ownerApiKey } : {}),
      ...init.headers,
    },
    cache: 'no-store',
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = body?.message || body?.error || `Request failed: ${response.status}`;
    throw new Error(Array.isArray(message) ? message.join(', ') : message);
  }
  return body as T;
}

export const api = {
  dashboard: (timezoneOffsetMinutes: number) => apiRequest(`/reports/dashboard?timezoneOffsetMinutes=${timezoneOffsetMinutes}`),
  projects: () => apiRequest('/projects'),
  project: (id: string) => apiRequest(`/projects/${id}`),
  createProject: (data: unknown) => apiRequest('/projects', { method: 'POST', body: JSON.stringify(data) }),
  updateProject: (id: string, data: unknown) => apiRequest(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  createTask: (projectId: string, data: unknown) => apiRequest(`/projects/${projectId}/tasks`, { method: 'POST', body: JSON.stringify(data) }),
  task: (id: string) => apiRequest(`/tasks/${id}`),
  updateTask: (id: string, data: unknown) => apiRequest(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  reviewTask: (id: string) => apiRequest(`/tasks/${id}/review`, { method: 'POST' }),
  completeTask: (id: string) => apiRequest(`/tasks/${id}/complete`, { method: 'POST' }),
  reopenTask: (id: string, note: string) => apiRequest(`/tasks/${id}/reopen`, { method: 'POST', body: JSON.stringify({ note }) }),
  startTimer: (taskId: string) => apiRequest('/timer/start', { method: 'POST', body: JSON.stringify({ taskId }) }),
  stopTimer: () => apiRequest('/timer/stop', { method: 'POST', body: JSON.stringify({}) }),
  report: (query: string) => apiRequest(`/reports/time?${query}`),
};
