import test from 'node:test';
import assert from 'node:assert/strict';
import { BinanceMarketFeed, MARKET_ASSETS, parseTickerMessage } from '../server/market.mjs';

test('parses a Binance combined 24h ticker event', () => {
  const parsed = parseTickerMessage(JSON.stringify({
    stream: 'btcusdt@ticker',
    data: { e: '24hrTicker', E: 1762600000000, s: 'BTCUSDT', c: '102345.670000', P: '2.35' },
  }));
  assert.equal(parsed.base, 'BTC');
  assert.equal(parsed.price, 102345.67);
  assert.equal(parsed.change24h, 2.35);
  assert.equal(parsed.quote, 'USDT');
});

test('ignores unknown symbols and malformed payloads', () => {
  assert.equal(parseTickerMessage('{invalid'), null);
  assert.equal(parseTickerMessage({ data: { s: 'NOTREALUSDT', c: '1', P: '0' } }), null);
});

test('the configured market list excludes FIT and includes mainstream spot assets', () => {
  const bases = MARKET_ASSETS.map((asset) => asset.base);
  assert.equal(bases.includes('FIT'), false);
  for (const symbol of ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE']) assert.ok(bases.includes(symbol));
});

test('market feed exposes parsed prices with live status after receiving a ticker', () => {
  class FakeWebSocket {
    static instances = [];
    listeners = new Map();
    constructor(url) { this.url = url; FakeWebSocket.instances.push(this); }
    addEventListener(name, callback) {
      const list = this.listeners.get(name) || [];
      list.push(callback);
      this.listeners.set(name, list);
    }
    emit(name, event = {}) { for (const callback of this.listeners.get(name) || []) callback(event); }
    close() { this.emit('close'); }
  }

  const feed = new BinanceMarketFeed({ WebSocketImpl: FakeWebSocket });
  feed.start();
  const socket = FakeWebSocket.instances[0];
  assert.match(socket.url, /btcusdt@ticker/);
  socket.emit('open');
  socket.emit('message', { data: JSON.stringify({ stream: 'btcusdt@ticker', data: { E: Date.now(), s: 'BTCUSDT', c: '100000.5', P: '-0.75' } }) });
  const partial = feed.snapshot();
  assert.equal(partial.status, 'partial');
  assert.equal(partial.liveAssetCount, 1);
  assert.equal(partial.assets.find((asset) => asset.base === 'BTC').price, 100000.5);
  assert.equal(partial.assets.find((asset) => asset.base === 'BTC').change24h, -0.75);
  for (const asset of MARKET_ASSETS.filter((item) => item.base !== 'BTC')) {
    socket.emit('message', { data: JSON.stringify({ stream: `${asset.symbol.toLowerCase()}@ticker`, data: { E: Date.now(), s: asset.symbol, c: '10.25', P: '0.10' } }) });
  }
  assert.equal(feed.snapshot().status, 'live');
  feed.stop();
});
