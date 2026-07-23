const INITIAL_LOOKBACK_SECONDS = 3 * 24 * 60 * 60;

export async function syncConfirmedOrders({ client, store, maxPages = 20 }) {
  const runId = store.beginSync('orders');
  try {
    const statuses = await client.call('getOrderStatusList');
    store.saveStatuses(statuses.statuses || []);
    let cursor = store.getCursor() || Math.floor(Date.now() / 1000) - INITIAL_LOOKBACK_SECONDS;
    let processed = 0;
    for (let page = 0; page < maxPages; page += 1) {
      const result = await client.call('getOrders', { date_confirmed_from: cursor, get_unconfirmed_orders: false });
      const orders = result.orders || [];
      if (!orders.length) break;
      const lastConfirmed = Math.max(...orders.map((order) => Number(order.date_confirmed || cursor)));
      const nextCursor = lastConfirmed > 0 ? lastConfirmed + 1 : cursor;
      store.saveOrders(orders, nextCursor);
      processed += orders.length;
      cursor = nextCursor;
      if (orders.length < 100) break;
    }
    store.endSync(runId, { processedCount: processed });
    return { processed, cursor };
  } catch (error) {
    store.endSync(runId, { processedCount: 0, errorMessage: error.message });
    throw error;
  }
}
