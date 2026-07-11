// Admin-side HTTP client. Deliberately narrow: it exposes ONLY operations the
// real admin API supports. When the admin agent needs something with no method
// here, that gap is a `missing-capability` finding — not a reason to reach past
// the API. Routes verified under src/api/admin/.
export function makeAdminClient({ baseUrl, token, fetchImpl = fetch }) {
  const headers = () => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  async function call(method, path, body) {
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: headers(),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    let parsed = null;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }
    return { status: res.status, body: parsed };
  }

  return {
    login: (email, password) =>
      call('POST', '/auth/user/emailpass', { email, password }),
    // Page through the FULL ledger. The route is paginated (defaultLimit 25,
    // maxLimit 100, returns `total`); calling it once and summing the first
    // page mis-totals any customer with >25 rows (sim run: 4997 vs true 5008).
    // Returns { status, body: { total, items: [all rows] } }; passes an error
    // response straight through.
    getCustomerTransactions: async (id) => {
      const items = [];
      let offset = 0;
      let total = Infinity;
      while (offset < total) {
        const r = await call(
          'GET',
          `/admin/customers/${id}/transactions?limit=100&offset=${offset}`,
        );
        if (r.status !== 200 || !r.body) return r;
        const page = r.body.items || [];
        items.push(...page);
        total = r.body.total ?? items.length;
        if (page.length === 0) break; // guard against a stuck cursor
        offset += page.length;
      }
      return { status: 200, body: { total: items.length, items } };
    },
    // The route reads body.note (not body.reason) and rejects an empty note.
    adjustCredits: (id, amount, note) =>
      call('POST', `/admin/customers/${id}/credits`, { amount, note }),
    freeze: (id, reason) =>
      call('POST', `/admin/customers/${id}/freeze`, { reason }),
    unfreeze: (id) => call('POST', `/admin/customers/${id}/unfreeze`, {}),
    getDeliveryOrder: (id) => call('GET', `/admin/delivery-orders/${id}`),
    updateDeliveryOrder: (id, patch) =>
      call('POST', `/admin/delivery-orders/${id}`, patch),
    reverseCommission: (id, reason) =>
      call('POST', `/admin/commissions/${id}/reverse`, { reason }),
  };
}
