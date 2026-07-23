import test from 'node:test';
import assert from 'node:assert/strict';
import { BaseLinkerClient } from '../src/baselinker-client.js';
import { createApp } from '../src/app.js';

test('recusa chamada quando o token não está configurado', async () => {
  const client = new BaseLinkerClient({ token: '', endpoint: 'https://example.test' });
  await assert.rejects(client.call('getOrders'), { code: 'NOT_CONFIGURED' });
});

test('envia método e parâmetros no formato da BaseLinker', async () => {
  let request;
  const client = new BaseLinkerClient({
    token: 'secret', endpoint: 'https://example.test',
    fetchImpl: async (url, options) => { request = { url, options }; return new Response(JSON.stringify({ status: 'SUCCESS' })); }
  });
  await client.call('getOrderStatusList');
  assert.equal(request.options.headers['X-BLToken'], 'secret');
  assert.equal(request.options.body.get('method'), 'getOrderStatusList');
});

test('bloqueia alteração de status quando a escrita está desativada', async () => {
  const app = createApp({ env: { JRDEV1_WRITE_ENABLED: 'false' }, client: { configured: () => true, call: async () => ({ status: 'SUCCESS' }) } });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;
  const response = await fetch(`http://127.0.0.1:${port}/api/orders/11/status`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ statusId: 22, confirmation: 'MOVER' })
  });
  server.close();
  assert.equal(response.status, 403);
});
