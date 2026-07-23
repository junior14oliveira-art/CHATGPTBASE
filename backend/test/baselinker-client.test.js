import test from 'node:test';
import assert from 'node:assert/strict';
import { BaseLinkerClient } from '../src/baselinker-client.js';

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
