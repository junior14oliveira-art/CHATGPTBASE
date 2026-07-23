const MIN_REQUEST_INTERVAL_MS = 650;

export class BaseLinkerClient {
  constructor({ token, endpoint, fetchImpl = fetch, now = () => Date.now() }) {
    this.token = token;
    this.endpoint = endpoint;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.nextRequestAt = 0;
  }

  configured() {
    return Boolean(this.token && this.token !== 'change-me');
  }

  async waitForTurn() {
    const wait = Math.max(0, this.nextRequestAt - this.now());
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    this.nextRequestAt = this.now() + MIN_REQUEST_INTERVAL_MS;
  }

  async call(method, parameters = {}) {
    if (!this.configured()) {
      const error = new Error('BaseLinker não configurada. Defina BASELINKER_TOKEN no backend.');
      error.code = 'NOT_CONFIGURED';
      throw error;
    }

    await this.waitForTurn();
    const body = new URLSearchParams({ method, parameters: JSON.stringify(parameters) });
    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: { 'X-BLToken': this.token, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      const error = new Error(`BaseLinker respondeu HTTP ${response.status}.`);
      error.code = 'UPSTREAM_HTTP';
      throw error;
    }

    const payload = await response.json();
    if (payload.status === 'ERROR') {
      const error = new Error(payload.error_message || 'A BaseLinker recusou a operação.');
      error.code = payload.error_code || 'BASELINKER_ERROR';
      throw error;
    }
    return payload;
  }
}
