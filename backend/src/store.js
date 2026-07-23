import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const parseJson = (value, fallback) => {
  try { return JSON.parse(value); } catch { return fallback; }
};

export class Jrdev1Store {
  constructor(filename) {
    mkdirSync(dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS order_statuses (id INTEGER PRIMARY KEY, name TEXT NOT NULL, color TEXT, synced_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS orders (
        order_id INTEGER PRIMARY KEY, status_id INTEGER, date_add INTEGER, date_confirmed INTEGER,
        buyer_name TEXT, source TEXT, payment_done REAL NOT NULL DEFAULT 0, payload_json TEXT NOT NULL, synced_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status_id);
      CREATE INDEX IF NOT EXISTS idx_orders_confirmed ON orders(date_confirmed);
      CREATE TABLE IF NOT EXISTS order_items (
        order_id INTEGER NOT NULL, item_key TEXT NOT NULL, sku TEXT, name TEXT NOT NULL, quantity INTEGER NOT NULL,
        payload_json TEXT NOT NULL, PRIMARY KEY(order_id, item_key),
        FOREIGN KEY(order_id) REFERENCES orders(order_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS sync_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, started_at INTEGER NOT NULL, finished_at INTEGER,
        processed_count INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, error_message TEXT
      );
    `);
  }

  getCursor() { return Number(this.db.prepare("SELECT value FROM sync_state WHERE key = 'orders_cursor'").get()?.value || 0); }

  inTransaction(work) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = work(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  saveStatuses(statuses) {
    const statement = this.db.prepare(`INSERT INTO order_statuses(id, name, color, synced_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, color=excluded.color, synced_at=excluded.synced_at`);
    const now = Date.now();
    this.inTransaction(() => statuses.forEach((status) => statement.run(status.id, status.name, status.color || null, now)));
  }

  saveOrders(orders, nextCursor) {
    const now = Date.now();
    const upsertOrder = this.db.prepare(`INSERT INTO orders(order_id, status_id, date_add, date_confirmed, buyer_name, source, payment_done, payload_json, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(order_id) DO UPDATE SET status_id=excluded.status_id, date_add=excluded.date_add, date_confirmed=excluded.date_confirmed,
      buyer_name=excluded.buyer_name, source=excluded.source, payment_done=excluded.payment_done, payload_json=excluded.payload_json, synced_at=excluded.synced_at`);
    const deleteItems = this.db.prepare('DELETE FROM order_items WHERE order_id = ?');
    const insertItem = this.db.prepare('INSERT INTO order_items(order_id, item_key, sku, name, quantity, payload_json) VALUES (?, ?, ?, ?, ?, ?)');
    const cursor = this.db.prepare(`INSERT INTO sync_state(key, value, updated_at) VALUES ('orders_cursor', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`);
    this.inTransaction(() => {
      for (const order of orders) {
        upsertOrder.run(order.order_id, order.order_status_id || null, order.date_add || null, order.date_confirmed || null,
          order.delivery_fullname || order.invoice_fullname || order.buyer_login || null, order.order_source || null,
          Number(order.payment_done || order.total_price || 0), JSON.stringify(order), now);
        deleteItems.run(order.order_id);
        (order.products || []).forEach((item, index) => insertItem.run(order.order_id, String(item.order_product_id || item.product_id || index), item.sku || null, item.name || 'Item sem nome', Number(item.quantity || 0), JSON.stringify(item)));
      }
      if (nextCursor) cursor.run(String(nextCursor), now);
    });
  }

  beginSync(kind) { return this.db.prepare('INSERT INTO sync_runs(kind, started_at, status) VALUES (?, ?, ?)').run(kind, Date.now(), 'running').lastInsertRowid; }
  endSync(id, { processedCount, errorMessage }) { this.db.prepare('UPDATE sync_runs SET finished_at=?, processed_count=?, status=?, error_message=? WHERE id=?').run(Date.now(), processedCount || 0, errorMessage ? 'error' : 'success', errorMessage || null, id); }
  lastSync() { return this.db.prepare('SELECT * FROM sync_runs WHERE kind = ? ORDER BY id DESC LIMIT 1').get('orders') || null; }

  listStatuses() { return this.db.prepare('SELECT id, name, color FROM order_statuses ORDER BY name').all(); }
  listOrders({ statusId, limit = 100 } = {}) {
    const rows = statusId ? this.db.prepare('SELECT payload_json FROM orders WHERE status_id = ? ORDER BY date_confirmed DESC, order_id DESC LIMIT ?').all(Number(statusId), limit)
      : this.db.prepare('SELECT payload_json FROM orders ORDER BY date_confirmed DESC, order_id DESC LIMIT ?').all(limit);
    return rows.map((row) => parseJson(row.payload_json, {}));
  }
  dashboard() {
    const now = new Date(); now.setHours(0, 0, 0, 0); const start = Math.floor(now.getTime() / 1000);
    const summary = this.db.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(payment_done), 0) AS revenue FROM orders WHERE date_confirmed >= ?').get(start);
    const queues = this.db.prepare(`SELECT statuses.id, statuses.name, statuses.color, COUNT(orders.order_id) AS count
      FROM order_statuses statuses JOIN orders ON orders.status_id = statuses.id
      WHERE orders.date_confirmed >= ? GROUP BY statuses.id, statuses.name, statuses.color HAVING COUNT(orders.order_id) > 0 ORDER BY count DESC`).all(start);
    return { generatedAt: new Date().toISOString(), ordersToday: Number(summary.count), revenueToday: Number(summary.revenue), ordersLimited: false, queues, recentOrders: this.listOrders({ limit: 8 }), lastSync: this.lastSync() };
  }
}
