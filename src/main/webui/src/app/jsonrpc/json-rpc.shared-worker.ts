// @ts-nocheck
// Shared Web Worker for JSON-RPC over WebSocket (TypeScript)
// Runs off the main thread and multiplexes multiple clients (tabs/components)

/** @typedef {'idle'|'connecting'|'open'|'closed'|'error'} ConnectionState */

console.debug('[nosignal_json-rpc] SharedWorker] Started');

const ports = new Set<MessagePort>();
let ws: WebSocket | null = null;
let state: any = 'idle';
let lastUrl: string | null = null;
let reconnectEnabled = true;
let reconnectDelay = 1000;
const reconnectMaxDelay = 30000;
let reconnectTimer: any = null;

/** Map of request id -> MessagePort that initiated it */
const pendingOrigin = new Map<string, MessagePort>();

/** Broadcast a message to all connected ports */
function broadcast(type: string, payload: any) {
  ports.forEach((port) => {
    try { port.postMessage({ type, ...payload }); } catch {}
  });
}

/** Send a message to a single port */
function sendTo(port: MessagePort, type: string, payload: any) {
  try { port.postMessage({ type, ...payload }); } catch {}
}

function setState(newState: any) {
  state = newState;
  broadcast('state', { state });
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
    // Inform all pending callers that the socket closed
    pendingOrigin.forEach((originPort, id) => {
      sendTo(originPort, 'responseError', { id, error: { message: 'WebSocket closed' } });
    });
    pendingOrigin.clear();
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
    const originPort = pendingOrigin.get(id);
    if (originPort) {
      if ('result' in msg) {
        sendTo(originPort, 'response', { id, result: msg.result });
      } else {
        sendTo(originPort, 'responseError', { id, error: msg.error || { message: 'JSON-RPC error' } });
      }
      pendingOrigin.delete(id);
    }
    return;
  }
  if ('jsonrpc' in msg && 'method' in msg && !('id' in msg)) {
    broadcast('notification', { message: msg });
    return;
  }
}

function sendRequest(port: MessagePort, id: string | number, method: string, params: any) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    sendTo(port, 'responseError', { id, error: { message: 'WebSocket is not open' } });
    return;
  }
  const request = { jsonrpc: '2.0', id, method, params } as const;
  try {
    pendingOrigin.set(String(id), port);
    ws.send(JSON.stringify(request));
  } catch (e) {
    pendingOrigin.delete(String(id));
    sendTo(port, 'responseError', { id, error: { message: 'Failed to send request' } });
  }
}

function sendNotification(method: string, params: any) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const notif = { jsonrpc: '2.0', method, params } as const;
  try { ws.send(JSON.stringify(notif)); } catch {}
}

self.onconnect = (event: MessageEvent) => {
  const port = (event as any).ports[0] as MessagePort;
  ports.add(port);

  // Immediately report current state to the new port
  sendTo(port, 'state', { state });

  port.onmessage = (e: MessageEvent) => {
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
        sendRequest(port, data.id, data.method, data.params);
        break;
      case 'notify':
        sendNotification(data.method, data.params);
        break;
    }
  };

  port.onmessageerror = () => {};
  port.start();

  (port as any).onclose = () => {
    ports.delete(port);
    // Clean up any pending requests tied to this port
    for (const [id, originPort] of pendingOrigin) {
      if (originPort === port) {
        pendingOrigin.delete(id);
      }
    }
  };
};
