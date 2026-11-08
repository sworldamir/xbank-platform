import { EventEmitter } from 'node:events';

// Binance Spot USDT pairs. Prices are exchange-specific spot prices, not a global composite.
export const MARKET_ASSETS = [
  { symbol: 'BTCUSDT', base: 'BTC', name: 'Bitcoin', icon: '₿', color: 'orange' },
  { symbol: 'ETHUSDT', base: 'ETH', name: 'Ethereum', icon: '◆', color: 'purple' },
  { symbol: 'BNBUSDT', base: 'BNB', name: 'BNB', icon: '◆', color: 'yellow' },
  { symbol: 'SOLUSDT', base: 'SOL', name: 'Solana', icon: '◎', color: 'teal' },
  { symbol: 'XRPUSDT', base: 'XRP', name: 'XRP', icon: '✕', color: 'blue' },
  { symbol: 'ADAUSDT', base: 'ADA', name: 'Cardano', icon: '●', color: 'blue' },
  { symbol: 'DOGEUSDT', base: 'DOGE', name: 'Dogecoin', icon: 'Ð', color: 'yellow' },
  { symbol: 'TRXUSDT', base: 'TRX', name: 'TRON', icon: '▲', color: 'red' },
  { symbol: 'LINKUSDT', base: 'LINK', name: 'Chainlink', icon: '⬡', color: 'blue' },
  { symbol: 'LTCUSDT', base: 'LTC', name: 'Litecoin', icon: 'Ł', color: 'gray' },
  { symbol: 'AVAXUSDT', base: 'AVAX', name: 'Avalanche', icon: '▲', color: 'red' },
  { symbol: 'DOTUSDT', base: 'DOT', name: 'Polkadot', icon: '●', color: 'pink' },
  { symbol: 'BCHUSDT', base: 'BCH', name: 'Bitcoin Cash', icon: 'Ƀ', color: 'green' },
  { symbol: 'SHIBUSDT', base: 'SHIB', name: 'Shiba Inu', icon: '🐕', color: 'orange' },
  { symbol: 'SUIUSDT', base: 'SUI', name: 'Sui', icon: '💧', color: 'teal' },
  { symbol: 'TONUSDT', base: 'TON', name: 'Toncoin', icon: '◆', color: 'blue' },
  { symbol: 'HYPEUSDT', base: 'HYPE', name: 'Hyperliquid', icon: '◆', color: 'purple' },
  { symbol: 'AAVEUSDT', base: 'AAVE', name: 'Aave', icon: 'Ⱥ', color: 'purple' },
  { symbol: 'UNIUSDT', base: 'UNI', name: 'Uniswap', icon: '🦄', color: 'pink' },
  { symbol: 'PEPEUSDT', base: 'PEPE', name: 'Pepe', icon: '🐸', color: 'green' },
  { symbol: 'NEARUSDT', base: 'NEAR', name: 'NEAR Protocol', icon: 'N', color: 'gray' },
  { symbol: 'HBARUSDT', base: 'HBAR', name: 'Hedera', icon: 'ℏ', color: 'purple' },
];

const ASSET_BY_SYMBOL = new Map(MARKET_ASSETS.map((asset) => [asset.symbol, asset]));

export function parseTickerMessage(raw) {
  let envelope;
  try {
    envelope = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  const ticker = envelope?.data || envelope;
  const asset = ASSET_BY_SYMBOL.get(String(ticker?.s || '').toUpperCase());
  const price = Number(ticker?.c);
  const change24h = Number(ticker?.P);
  if (!asset || !Number.isFinite(price) || price <= 0 || !Number.isFinite(change24h)) return null;
  const eventTime = Number(ticker.E);
  return {
    ...asset,
    price,
    change24h,
    eventTime: Number.isFinite(eventTime) && eventTime > 0 ? eventTime : Date.now(),
    quote: 'USDT',
  };
}

export class BinanceMarketFeed extends EventEmitter {
  constructor({ WebSocketImpl = globalThis.WebSocket } = {}) {
    super();
    this.WebSocketImpl = WebSocketImpl;
    this.socket = null;
    this.connected = false;
    this.stopped = false;
    this.retryTimer = null;
    this.statusTimer = null;
    this.retryAttempt = 0;
    this.lastMessageAt = null;
    this.lastError = null;
    this.prices = new Map();
  }

  start() {
    if (this.stopped) this.stopped = false;
    if (!this.statusTimer) {
      this.statusTimer = setInterval(() => this.emit('update', this.snapshot()), 5000);
      this.statusTimer.unref?.();
    }
    this.connect();
  }

  connect() {
    if (this.stopped || this.socket) return;
    if (typeof this.WebSocketImpl !== 'function') {
      this.lastError = 'WebSocket client unavailable; use Node.js 22 or newer.';
      this.emit('update', this.snapshot());
      this.scheduleReconnect();
      return;
    }

    const streams = MARKET_ASSETS.map(({ symbol }) => `${symbol.toLowerCase()}@ticker`).join('/');
    const endpoint = `wss://data-stream.binance.vision:443/stream?streams=${streams}`;
    let socket;
    try {
      socket = new this.WebSocketImpl(endpoint);
      this.socket = socket;
    } catch (error) {
      this.lastError = error?.message || 'Unable to create market data connection.';
      this.socket = null;
      this.scheduleReconnect();
      return;
    }

    socket.addEventListener('open', () => {
      if (this.socket !== socket) return;
      this.connected = true;
      this.retryAttempt = 0;
      this.lastError = null;
      this.emit('update', this.snapshot());
    });

    socket.addEventListener('message', (event) => {
      if (this.socket !== socket) return;
      const parsed = parseTickerMessage(event.data);
      if (!parsed) return;
      const receivedAt = Date.now();
      this.prices.set(parsed.base, { ...parsed, receivedAt });
      this.lastMessageAt = receivedAt;
      this.emit('update', this.snapshot());
    });

    socket.addEventListener('error', () => {
      if (this.socket !== socket) return;
      this.lastError = 'Market data connection error.';
      this.emit('update', this.snapshot());
    });

    socket.addEventListener('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.connected = false;
      this.emit('update', this.snapshot());
      this.scheduleReconnect();
    });
  }

  scheduleReconnect() {
    if (this.stopped || this.retryTimer) return;
    const delay = Math.min(30_000, 2_000 * (2 ** Math.min(this.retryAttempt, 4)));
    this.retryAttempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
    this.retryTimer.unref?.();
  }

  snapshot() {
    const ageMs = this.lastMessageAt === null ? null : Date.now() - this.lastMessageAt;
    const hasAnyPrice = this.prices.size > 0;
    const now = Date.now();
    const freshCount = MARKET_ASSETS.reduce((count, asset) => {
      const current = this.prices.get(asset.base);
      return count + (current?.receivedAt && now - current.receivedAt <= 15_000 ? 1 : 0);
    }, 0);
    let status = 'connecting';
    if (this.connected && freshCount === MARKET_ASSETS.length) status = 'live';
    else if (this.connected && freshCount > 0) status = 'partial';
    else if (hasAnyPrice) status = 'stale';
    else if (this.lastError || this.retryTimer) status = 'reconnecting';

    return {
      provider: 'Binance Spot',
      providerUrl: 'https://www.binance.com/en/markets/overview',
      quoteCurrency: 'USDT',
      status,
      updateIntervalMs: 1000,
      updatedAt: this.lastMessageAt ? new Date(this.lastMessageAt).toISOString() : null,
      ageMs,
      liveAssetCount: freshCount,
      totalAssetCount: MARKET_ASSETS.length,
      lastError: this.lastError,
      assets: MARKET_ASSETS.map((asset) => {
        const current = this.prices.get(asset.base);
        const fresh = Boolean(current?.receivedAt && now - current.receivedAt <= 15_000);
        return current
          ? { ...current, dataStatus: fresh ? 'live' : 'stale' }
          : { ...asset, price: null, change24h: null, eventTime: null, receivedAt: null, quote: 'USDT', dataStatus: 'connecting' };
      }),
    };
  }

  stop() {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.statusTimer) clearInterval(this.statusTimer);
    this.retryTimer = null;
    this.statusTimer = null;
    const socket = this.socket;
    this.socket = null;
    this.connected = false;
    try { socket?.close(); } catch { /* ignore shutdown errors */ }
  }
}

export const marketFeed = new BinanceMarketFeed();
