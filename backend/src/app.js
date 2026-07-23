import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { BaseLinkerClient } from './baselinker-client.js';
import { Jrdev1Store } from './store.js';
import { syncConfirmedOrders } from './sync-service.js';

export function createApp({ env = process.env, client, store } = {}) {
  const api = client || new BaseLinkerClient({
    token: env.BASELINKER_TOKEN,
    endpoint: env.BASELINKER_API_URL || 'https://api.baselinker.com/connector.php'
  });
  const app = express();
  const dataStore = store || new Jrdev1Store(env.JRDEV1_DB_PATH || './data/jrdev1.sqlite');
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

  const requireAdminToken = (req, res) => {
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

  const requireWriteAccess = (req, res) => {
    if (env.JRDEV1_WRITE_ENABLED !== 'true') {
      res.status(403).json({ error: 'Escrita desativada. Homologue e habilite JRDEV1_WRITE_ENABLED=true.' });
      return false;
    }
    return requireAdminToken(req, res);
  };

  app.get('/health', (req, res) => res.json({ ok: true, baseLinkerConfigured: api.configured(), writeEnabled: env.JRDEV1_WRITE_ENABLED === 'true', lastSync: dataStore.lastSync() }));

  app.get('/api/dashboard', (req, res) => res.json(dataStore.dashboard()));

  app.get('/api/statuses', (req, res) => res.json({ statuses: dataStore.listStatuses() }));

  app.get('/api/orders', (req, res) => res.json({ orders: dataStore.listOrders({ statusId: req.query.statusId }), limited: false }));

  app.post('/api/sync/orders', asyncRoute(async (req, res) => {
    if (!requireAdminToken(req, res)) return;
    const result = await syncConfirmedOrders({ client: api, store: dataStore });
    res.json({ ok: true, ...result, lastSync: dataStore.lastSync() });
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
