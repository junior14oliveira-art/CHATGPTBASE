import express from 'express';
import { BaseLinkerClient } from './baselinker-client.js';

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return Math.floor(date.getTime() / 1000);
};

const safeNumber = (value) => Number.parseFloat(value || 0) || 0;

export function createApp({ env = process.env, client } = {}) {
  const api = client || new BaseLinkerClient({
    token: env.BASELINKER_TOKEN,
    endpoint: env.BASELINKER_API_URL || 'https://api.baselinker.com/connector.php'
  });
  const app = express();
  const origin = env.ALLOWED_ORIGIN || 'http://localhost:5173';

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: '100kb' }));

  const asyncRoute = (handler) => async (req, res) => {
    try { await handler(req, res); } catch (error) {
      const status = error.code === 'NOT_CONFIGURED' ? 503 : 502;
      res.status(status).json({ error: error.message, code: error.code || 'UPSTREAM_ERROR' });
    }
  };

  app.get('/health', (req, res) => res.json({ ok: true, baseLinkerConfigured: api.configured(), writeEnabled: env.JRDEV1_WRITE_ENABLED === 'true' }));

  app.get('/api/dashboard', asyncRoute(async (req, res) => {
    const [statusData, ordersData] = await Promise.all([
      api.call('getOrderStatusList'),
      api.call('getOrders', { date_confirmed_from: startOfToday(), get_unconfirmed_orders: false })
    ]);
    const orders = ordersData.orders || [];
    const revenue = orders.reduce((total, order) => total + safeNumber(order.payment_done || order.total_price), 0);
    const queues = (statusData.statuses || []).map((status) => ({
      id: status.id,
      name: status.name,
      color: status.color,
      count: orders.filter((order) => Number(order.order_status_id) === Number(status.id)).length
    })).filter((status) => status.count > 0);
    res.json({
      generatedAt: new Date().toISOString(),
      ordersToday: orders.length,
      revenueToday: revenue,
      ordersLimited: orders.length === 100,
      queues,
      recentOrders: orders.slice(0, 8)
    });
  }));

  app.get('/api/statuses', asyncRoute(async (req, res) => {
    const data = await api.call('getOrderStatusList');
    res.json({ statuses: data.statuses || [] });
  }));

  app.get('/api/orders', asyncRoute(async (req, res) => {
    const parameters = { get_unconfirmed_orders: false };
    if (req.query.statusId) parameters.status_id = Number(req.query.statusId);
    if (req.query.from) parameters.date_confirmed_from = Number(req.query.from);
    const data = await api.call('getOrders', parameters);
    res.json({ orders: data.orders || [], limited: (data.orders || []).length === 100 });
  }));

  app.get('/api/inventory', asyncRoute(async (req, res) => {
    const [inventories, warehouses] = await Promise.all([
      api.call('getInventories'),
      api.call('getInventoryWarehouses')
    ]);
    res.json({ inventories: inventories.inventories || [], warehouses: warehouses.warehouses || [] });
  }));

  app.get('/api/inventory/:inventoryId/products', asyncRoute(async (req, res) => {
    const parameters = { inventory_id: Number(req.params.inventoryId), page: Number(req.query.page || 1), include_variants: true };
    if (req.query.search) parameters.filter_name = String(req.query.search).slice(0, 200);
    const data = await api.call('getInventoryProductsList', parameters);
    res.json({ products: Object.values(data.products || {}) });
  }));

  app.post('/api/orders/:orderId/status', asyncRoute(async (req, res) => {
    if (env.JRDEV1_WRITE_ENABLED !== 'true') return res.status(403).json({ error: 'Escrita desativada. Homologue e habilite JRDEV1_WRITE_ENABLED=true.' });
    const statusId = Number(req.body.statusId);
    if (!Number.isInteger(statusId)) return res.status(400).json({ error: 'statusId válido é obrigatório.' });
    const data = await api.call('setOrderStatus', { order_id: Number(req.params.orderId), status_id: statusId });
    res.json({ ok: true, result: data });
  }));

  return app;
}
