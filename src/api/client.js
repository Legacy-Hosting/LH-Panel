const API_ROOT = (import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1').replace(/\/$/, '')

async function request(path, options = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }))
    throw new Error(error.message || `Request failed with status ${response.status}`)
  }

  return response.json()
}

export const panelApi = {
  overview: () => request('/panel/overview'),
  applications: () => request('/panel/applications'),
  nodes: () => request('/panel/nodes'),
  domains: () => request('/panel/domains'),
  deployments: () => request('/panel/deployments'),
}
