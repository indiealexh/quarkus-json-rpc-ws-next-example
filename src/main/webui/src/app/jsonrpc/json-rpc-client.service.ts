import { Injectable, Inject } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { JSON_RPC_WS_URL } from './json-rpc.tokens';
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcErrorResponse,
  JsonRpcNotification,
} from './json-rpc.types';
import { v7 as uuidv7 } from 'uuid';

export type ConnectionState = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timeoutId?: any;
}

@Injectable({ providedIn: 'root' })
export class JsonRpcClientService {
  private ws?: WebSocket;
  private defaultUrl: string;
  private pending = new Map<string, PendingRequest>();

  private connectionState$ = new BehaviorSubject<ConnectionState>('idle');
  private notifications$ = new Subject<JsonRpcNotification>();

  // Auto-reconnect state
  private reconnectEnabled = true;
  private reconnectDelay = 1000; // start with 1s
  private readonly reconnectMaxDelay = 30000; // cap at 30s
  private reconnectTimer?: any;
  private lastUrl?: string;

  constructor(@Inject(JSON_RPC_WS_URL) defaultUrl: string) {
    this.defaultUrl = defaultUrl;
  }

  get state$(): Observable<ConnectionState> {
    return this.connectionState$.asObservable();
  }

  get isOpen$(): Observable<boolean> {
    return this.state$.pipe(map((s) => s === 'open'));
  }

  get notifications(): Observable<JsonRpcNotification> {
    return this.notifications$.asObservable();
  }

  /** Connects to the WebSocket endpoint. If already connected to the same URL, no-op. */
  connect(url?: string): void {
    const target = url ?? this.defaultUrl;
    this.lastUrl = target;

    // enable reconnect attempts for explicit connects
    this.reconnectEnabled = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      // If same URL, do nothing
      try {
        const currentUrl = (this.ws as any).url as string | undefined;
        if (currentUrl === target) return;
      } catch {
        // ignore
      }
      // Close existing before reconnecting to a different URL
      try { this.ws.close(1000, 'Reconnecting to different URL'); } catch {}
      this.ws = undefined;
    }

    this.connectionState$.next('connecting');
    const ws = new WebSocket(target);
    this.ws = ws;

    ws.onopen = () => {
      this.connectionState$.next('open');
      // reset backoff on successful open
      this.reconnectDelay = 1000;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = undefined;
      }
    };

    ws.onclose = () => {
      this.connectionState$.next('closed');
      // Reject all pending and clear timeouts
      this.pending.forEach((p) => {
        try { if (p.timeoutId) clearTimeout(p.timeoutId); } catch {}
        p.reject(new Error('WebSocket closed'));
      });
      this.pending.clear();
      this.ws = undefined;
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      this.connectionState$.next('error');
      // let onclose handle the actual reconnect; if close doesn't arrive, schedule anyway
      this.scheduleReconnect();
    };

    ws.onmessage = (evt: MessageEvent) => {
      const data = evt.data;
      if (typeof data === 'string') {
        this.handleIncomingString(data);
      } else if (data instanceof Blob) {
        data.text().then((text) => this.handleIncomingString(text)).catch(() => {/* ignore parse errors */});
      } else if (data instanceof ArrayBuffer) {
        try {
          const text = new TextDecoder().decode(new Uint8Array(data));
          this.handleIncomingString(text);
        } catch {
          // ignore
        }
      }
    };
  }

  /** Gracefully closes the connection */
  close(code?: number, reason?: string): void {
    // Disable auto-reconnect and clear any pending timer
    this.reconnectEnabled = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    if (this.ws) {
      try {
        this.ws.close(code, reason);
      } catch {
        // ignore
      }
      this.ws = undefined;
    }
  }

  /** Performs a JSON-RPC call and resolves with the result or rejects with an error */
  async call<T = any>(method: string, params?: Record<string, any>, timeoutMs = 15000): Promise<T> {
    // Ensure connection is open; tolerate reconnects by waiting up to timeoutMs
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.connect(this.lastUrl ?? this.defaultUrl);
      await this.waitForOpen(timeoutMs);
    }

    const ws = this.ensureOpen();
    const id = (uuidv7()).toString();
    const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };

    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`JSON-RPC call timeout for method ${method}`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timeoutId });

      ws.send(JSON.stringify(request));
    });
  }

  /** Sends a JSON-RPC notification (no response expected) */
  notify(method: string, params?: Record<string, any>): void {
    const ws = this.ensureOpen();
    const notification: JsonRpcNotification = { jsonrpc: '2.0', method, params } as any;
    ws.send(JSON.stringify(notification));
  }

  /** Waits for the connection to open before resolving; keeps waiting across transient errors/closures */
  waitForOpen(timeoutMs = 15000): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        sub.unsubscribe();
        reject(new Error('Timed out waiting for WebSocket to open'));
      }, timeoutMs);

      const sub = this.state$
        .pipe(filter((s) => s === 'open'))
        .subscribe(() => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          sub.unsubscribe();
          resolve();
        });

      // Fast path: if already open, resolve immediately
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          sub.unsubscribe();
          resolve();
        }
      }
    });
  }

  private ensureOpen(): WebSocket {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not open. Call connect() first and wait for state to be open.');
    }
    return this.ws;
    }

  private handleIncomingString(raw: string): void {
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return; // ignore invalid JSON
    }

    if (Array.isArray(parsed)) {
      parsed.forEach((entry) => this.dispatchIncoming(entry));
    } else {
      this.dispatchIncoming(parsed);
    }
  }

  private dispatchIncoming(msg: any): void {
    if (!msg || typeof msg !== 'object') return;
    // Response path
    if ('jsonrpc' in msg && 'id' in msg && ('result' in msg || 'error' in msg)) {
      const response = msg as JsonRpcResponse;
      const key = String((response as any).id);
      const pending = this.pending.get(key);
      if (pending) {
        if ('result' in response) {
          pending.resolve((response as any).result);
        } else {
          const err = response as JsonRpcErrorResponse;
          const error = new Error(err.error?.message ?? 'JSON-RPC error');
          (error as any).code = err.error?.code;
          (error as any).data = err.error?.data;
          pending.reject(error);
        }
        if (pending.timeoutId) clearTimeout(pending.timeoutId);
        this.pending.delete(key);
      }
      return;
    }

    // Notification path: method present and no id
    if ('jsonrpc' in msg && 'method' in msg && !('id' in msg)) {
      this.notifications$.next(msg as JsonRpcNotification);
      return;
    }

    // Ignore anything else
  }

  private scheduleReconnect(): void {
    if (!this.reconnectEnabled) return;
    if (this.ws) return; // already connected/connecting
    const target = this.lastUrl ?? this.defaultUrl;
    if (!target) return;
    if (this.reconnectTimer) return;

    const delay = this.reconnectDelay;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (!this.reconnectEnabled) return;
      this.connect(target);
      // Exponential backoff with cap
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.reconnectMaxDelay);
    }, delay);
  }
}
