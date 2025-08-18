// @ts-nocheck
// Dedicated Web Worker for JSON-RPC over WebSocket (TypeScript)
// Runs off the main thread and handles a single client (the creating page)

/** @typedef {'idle'|'connecting'|'open'|'closed'|'error'} ConnectionState */

let ws: WebSocket | null = null;
let state: any = 'idle';
let lastUrl: string | null = null;
let reconnectEnabled = true;
let reconnectDelay = 1000;
const reconnectMaxDelay = 30000;
let reconnectTimer: any = null;

function post(type: string, payload: any) {
  try { (self as any).postMessage({ type, ...payload }); } catch {}
}

function setState(newState: any) {
  state = newState;
  post('state', { state });
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    try { clearTimeout(reconnectTimer); } catch {}
    reconnectTimer = null;
  }
}

function scheduleReconnect() {
  if (!reconnectEnabled) return;
  if (ws) return; // already connected/connecting
  if (!lastUrl) return;
  if (reconnectTimer) return;
  const delay = reconnectDelay;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!reconnectEnabled) return;
    connect(lastUrl!);
    reconnectDelay = Math.min(reconnectDelay * 2, reconnectMaxDelay);
  }, delay);
}

function connect(url?: string | null) {
  lastUrl = url || lastUrl;
  if (!lastUrl) return;

  // If already connecting/open to same URL, ignore
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    try {
      const currentUrl = (ws as any).url as string | undefined;
      if (currentUrl === lastUrl) return;
    } catch {}
    // Reconnect to different URL
    try { ws.close(1000, 'Reconnecting to different URL'); } catch {}
    ws = null;
  }

  clearReconnectTimer();
  setState('connecting');

  try {
    ws = new WebSocket(lastUrl);
  } catch (e) {
    setState('error');
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    setState('open');
    reconnectDelay = 1000;
    clearReconnectTimer();
  };

  ws.onclose = () => {
    setState('closed');
    ws = null;
    scheduleReconnect();
  };

  ws.onerror = () => {
    setState('error');
    scheduleReconnect();
  };

  ws.onmessage = (evt: MessageEvent) => {
    const data = (evt as any).data;
    if (typeof data === 'string') {
      handleIncomingString(data);
    } else if (data instanceof Blob) {
      data.text().then((text: string) => handleIncomingString(text)).catch(() => {});
    } else if (data instanceof ArrayBuffer) {
      try {
        const text = new TextDecoder().decode(new Uint8Array(data));
        handleIncomingString(text);
      } catch {}
    }
  };
}

function handleIncomingString(raw: string) {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  if (Array.isArray(parsed)) {
    parsed.forEach((msg) => dispatchIncoming(msg));
  } else {
    dispatchIncoming(parsed);
  }
}

function dispatchIncoming(msg: any) {
  if (!msg || typeof msg !== 'object') return;
  if ('jsonrpc' in msg && 'id' in msg && ('result' in msg || 'error' in msg)) {
    const id = String(msg.id);
    if ('result' in msg) {
      post('response', { id, result: msg.result });
    } else {
      post('responseError', { id, error: msg.error || { message: 'JSON-RPC error' } });
    }
    return;
  }
  if ('jsonrpc' in msg && 'method' in msg && !('id' in msg)) {
    post('notification', { message: msg });
    return;
  }
}

function sendRequest(id: string | number, method: string, params: any) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    post('responseError', { id, error: { message: 'WebSocket is not open' } });
    return;
  }
  const request = { jsonrpc: '2.0', id, method, params } as const;
  try {
    ws.send(JSON.stringify(request));
  } catch (e) {
    post('responseError', { id, error: { message: 'Failed to send request' } });
  }
}

function sendNotification(method: string, params: any) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const notif = { jsonrpc: '2.0', method, params } as const;
  try { ws.send(JSON.stringify(notif)); } catch {}
}

(self as any).onmessage = (e: MessageEvent) => {
  const data: any = (e as any).data || {};
  switch (data.type) {
    case 'connect':
      reconnectEnabled = true;
      clearReconnectTimer();
      connect(data.url);
      break;
    case 'disconnect':
      reconnectEnabled = false;
      clearReconnectTimer();
      if (ws) {
        try { ws.close(data.code, data.reason); } catch {}
        ws = null;
      }
      break;
    case 'request':
      sendRequest(data.id, data.method, data.params);
      break;
    case 'notify':
      sendNotification(data.method, data.params);
      break;
  }
};
