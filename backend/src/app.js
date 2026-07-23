import express from 'express';
import { timingSafeEqual } from 'node:crypto';
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

  const requireWriteAccess = (req, res) => {
    if (env.JRDEV1_WRITE_ENABLED !== 'true') {
      res.status(403).json({ error: 'Escrita desativada. Homologue e habilite JRDEV1_WRITE_ENABLED=true.' });
      return false;
    }
    if (!env.JRDEV1_ADMIN_TOKEN) {
      res.status(503).json({ error: 'Comandos de escrita exigem JRDEV1_ADMIN_TOKEN no servidor.' });
      return false;
    }
    const supplied = req.get('x-jrdev1-admin-token') || '';
    const expected = env.JRDEV1_ADMIN_TOKEN;
    if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
      res.status(401).json({ error: 'Credencial operacional inválida.' });
      return false;
    }
    return true;
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

  app.get('/api/pickpack/carts', asyncRoute(async (req, res) => {
    const data = await api.call('getPickPackCarts');
    res.json({ carts: data.carts || [] });
  }));

  app.get('/api/pickpack/carts/:cartId/orders', asyncRoute(async (req, res) => {
    const data = await api.call('getPickPackCartOrders', { cart_id: Number(req.params.cartId) });
    res.json({ orderIds: data.orders || [] });
  }));

  app.post('/api/orders/:orderId/status', asyncRoute(async (req, res) => {
    if (!requireWriteAccess(req, res)) return;
    if (req.body.confirmation !== 'MOVER') return res.status(400).json({ error: 'Confirmação MOVER é obrigatória.' });
    const statusId = Number(req.body.statusId);
    if (!Number.isInteger(statusId)) return res.status(400).json({ error: 'statusId válido é obrigatório.' });
    const data = await api.call('setOrderStatus', { order_id: Number(req.params.orderId), status_id: statusId });
    res.json({ ok: true, result: data });
  }));

  app.post('/api/orders/statuses', asyncRoute(async (req, res) => {
    if (!requireWriteAccess(req, res)) return;
    if (req.body.confirmation !== 'MOVER') return res.status(400).json({ error: 'Confirmação MOVER é obrigatória.' });
    const orderIds = Array.isArray(req.body.orderIds) ? req.body.orderIds.map(Number).filter(Number.isInteger) : [];
    const statusId = Number(req.body.statusId);
    if (!orderIds.length || !Number.isInteger(statusId)) return res.status(400).json({ error: 'orderIds e statusId válidos são obrigatórios.' });
    const data = await api.call('setOrderStatuses', { order_ids: orderIds, status_id: statusId });
    res.json({ ok: true, result: data });
  }));

  app.post('/api/pickpack/carts/:cartId/orders', asyncRoute(async (req, res) => {
    if (!requireWriteAccess(req, res)) return;
    if (req.body.confirmation !== 'ATRIBUIR') return res.status(400).json({ error: 'Confirmação ATRIBUIR é obrigatória.' });
    const orderIds = Array.isArray(req.body.orderIds) ? req.body.orderIds.map(Number).filter(Number.isInteger) : [];
    if (!orderIds.length || !Number.isInteger(Number(req.params.cartId))) return res.status(400).json({ error: 'cartId e orderIds válidos são obrigatórios.' });
    const data = await api.call('addPickPackOrdersToCart', { cart_id: Number(req.params.cartId), order_ids: orderIds });
    res.json({ ok: true, result: data });
  }));

  return app;
}
