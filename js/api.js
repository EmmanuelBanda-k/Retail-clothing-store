async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed with status ${response.status}`);
  return body;
}

export async function databaseAvailable() {
  try {
    await request('/api/health');
    return true;
  } catch {
    return false;
  }
}

export const posApi = {
  login: (username, pin) => request('/api/login', {
    method: 'POST', body: JSON.stringify({ username, pin })
  }),
  session: () => request('/api/session'),
  logout: () => request('/api/logout', { method: 'POST' }),
  snapshot: () => request('/api/snapshot'),
  completeSale: data => request('/api/sales', { method: 'POST', body: JSON.stringify(data) }),
  refundSale: (saleId, data) => request(`/api/sales/${saleId}/refund`, {
    method: 'POST', body: JSON.stringify(data)
  }),
  receiveStock: data => request('/api/inventory/receive', {
    method: 'POST', body: JSON.stringify(data)
  }),
  addProduct: data => request('/api/products', {
    method: 'POST', body: JSON.stringify(data)
  })
};
