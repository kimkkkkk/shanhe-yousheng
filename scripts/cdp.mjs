/**
 * Minimal Chrome DevTools Protocol harness for local visual/functional checks.
 * Chrome must be running with --remote-debugging-port=9222.
 */
import { writeFile } from 'node:fs/promises';

const DEBUG_URL = process.env.CDP_URL || 'http://127.0.0.1:9222';

export async function connectPage() {
  const list = await fetch(`${DEBUG_URL}/json/list`).then((r) => r.json());
  const page = list.find((t) => t.type === 'page');
  if (!page) throw new Error('No page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let seq = 0;
  const pending = new Map();
  const listeners = new Map();
  const logs = [];
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(`${message.error.message} (${waiter.method})`));
      else waiter.resolve(message.result);
      return;
    }
    if (message.method === 'Runtime.consoleAPICalled') {
      logs.push({
        type: message.params.type,
        text: message.params.args.map((a) => a.value ?? a.description ?? '').join(' ')
      });
    }
    if (message.method === 'Runtime.exceptionThrown') {
      logs.push({ type: 'exception', text: message.params.exceptionDetails.text });
    }
    if (message.method === 'Log.entryAdded') {
      const entry = message.params.entry;
      logs.push({ type: entry.level || 'error', text: `${entry.source || ''}: ${entry.text || ''}` });
    }
    for (const fn of listeners.get(message.method) || []) fn(message.params);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject, method });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const on = (event, fn) => {
    if (!listeners.has(event)) listeners.set(event, []);
    listeners.get(event).push(fn);
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable').catch(() => {});
  return { ws, send, on, logs, close: () => ws.close() };
}

export async function emulate(browser, { width = 390, height = 844, dsf = 2, mobile = true } = {}) {
  await browser.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: dsf,
    mobile,
    screenWidth: width,
    screenHeight: height
  });
  await browser.send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 0 }).catch(() => {});
}

export async function navigate(browser, url, { wait = 1500 } = {}) {
  const loaded = new Promise((resolve) => {
    const handler = () => resolve();
    browser.on('Page.loadEventFired', handler);
  });
  await browser.send('Page.navigate', { url });
  await Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, 8000))]);
  await new Promise((resolve) => setTimeout(resolve, wait));
}

export async function evaluate(browser, expression) {
  const result = await browser.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

export async function waitFor(browser, expression, timeout = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(browser, expression)) return true;
    await new Promise((resolve) => setTimeout(resolve, 180));
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

export async function screenshot(browser, path, { fullPage = false } = {}) {
  let params = { format: 'png', captureBeyondViewport: fullPage };
  if (fullPage) {
    const metrics = await browser.send('Page.getLayoutMetrics');
    const size = metrics.cssContentSize || metrics.contentSize;
    params = {
      ...params,
      clip: { x: 0, y: 0, width: Math.ceil(size.width), height: Math.ceil(size.height), scale: 1 }
    };
  }
  const result = await browser.send('Page.captureScreenshot', params);
  await writeFile(path, Buffer.from(result.data, 'base64'));
  console.log(`screenshot -> ${path}`);
}

export async function click(browser, selector) {
  await evaluate(
    browser,
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('missing ${selector.replaceAll("'", "\\'")}'); el.click(); return true; })()`
  );
  await new Promise((resolve) => setTimeout(resolve, 350));
}

export async function type(browser, selector, value) {
  await evaluate(
    browser,
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('missing input'); el.focus(); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', {bubbles:true})); return true; })()`
  );
  await new Promise((resolve) => setTimeout(resolve, 180));
}
