import {Inject, Injectable} from '@angular/core';
import {BehaviorSubject, Observable, Subject} from 'rxjs';
import {filter, map} from 'rxjs/operators';
import {JSON_RPC_WS_URL} from './json-rpc.tokens';
import type {JsonRpcErrorResponse, JsonRpcNotification, JsonRpcResponse,} from './json-rpc.types';
import {v7 as uuidv7} from 'uuid';

export type ConnectionState = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timeoutId?: any;
}

@Injectable({providedIn: 'root'})
export class JsonRpcClientService {
  private ws?: WebSocket;
  private defaultUrl: string;
  private pending = new Map<string, PendingRequest>();

  // Worker connection
  private worker?: Worker;

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

  /** Connects to the WebSocket endpoint via Worker. If already connected, sends connect to the worker. */
  connect(url?: string): void {
    const target = url ?? this.defaultUrl;
    this.lastUrl = target;

    // Initialize the Worker if needed
    if (!this.worker) {
      try {
        // Use module worker so it is bundled by Angular
        this.worker = new Worker(
          new URL('./json-rpc.worker.ts', import.meta.url),
          { type: 'module' }
        );
        this.worker.onmessage = (evt: MessageEvent) => {
          const data: any = evt.data || {};
          switch (data.type) {
            case 'state':
              this.connectionState$.next(data.state);
              break;
            case 'notification':
              this.notifications$.next(data.message as JsonRpcNotification);
              break;
            case 'response': {
              const key = String(data.id);
              const pending = this.pending.get(key);
              if (pending) {
                try {
                  if (pending.timeoutId) clearTimeout(pending.timeoutId);
                } catch {}
                pending.resolve(data.result);
                this.pending.delete(key);
              }
              break;
            }
            case 'responseError': {
              const key = String(data.id);
              const pending = this.pending.get(key);
              if (pending) {
                try {
                  if (pending.timeoutId) clearTimeout(pending.timeoutId);
                } catch {}
                const errObj = data.error || {};
                const error = new Error(errObj.message || 'JSON-RPC error');
                (error as any).code = errObj.code;
                (error as any).data = errObj.data;
                pending.reject(error);
                this.pending.delete(key);
              }
              break;
            }
          }
        };
      } catch (e) {
        // If Worker creation fails, mark error state
        this.connectionState$.next('error');
        return;
      }
    }

    // enable reconnect attempts at the worker by sending a connect message
    try {
      this.connectionState$.next('connecting');
      this.worker!.postMessage({type: 'connect', url: target});
    } catch {
      this.connectionState$.next('error');
    }
  }

  /** Gracefully closes the connection via the Worker */
  close(code?: number, reason?: string): void {
    // Disable any local timers
    this.reconnectEnabled = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    try {
      if (this.worker) {
        this.worker.postMessage({type: 'disconnect', code, reason});
      }
    } catch {
      // ignore
    }
  }

  /** Performs a JSON-RPC call and resolves with the result or rejects with an error */
  async call<T = any>(method: string, params?: Record<string, any>, timeoutMs = 15000): Promise<T> {
    // Ensure connection is open via the Worker; tolerate reconnects by waiting up to timeoutMs
    if (!this.worker || this.connectionState$.getValue() !== 'open') {
      this.connect(this.lastUrl ?? this.defaultUrl);
      await this.waitForOpen(timeoutMs);
    }

    const id = (uuidv7()).toString();
    // Store pending before sending
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`JSON-RPC call timeout for method ${method}`));
      }, timeoutMs);

      this.pending.set(id, {resolve, reject, timeoutId});

      try {
        this.worker!.postMessage({type: 'request', id, method, params});
      } catch (e) {
        const pending = this.pending.get(id);
        if (pending && pending.timeoutId) {
          try {
            clearTimeout(pending.timeoutId);
          } catch {}
        }
        this.pending.delete(id);
        reject(new Error('Failed to send request to worker'));
      }
    });
  }

  /** Sends a JSON-RPC notification (no response expected) */
  notify(method: string, params?: Record<string, any>): void {
    if (!this.worker || this.connectionState$.getValue() !== 'open') {
      throw new Error('Connection is not open. Call connect() first and wait for state to be open.');
    }
    const notification: JsonRpcNotification = {jsonrpc: '2.0', method, params} as any;
    try {
      this.worker.postMessage({type: 'notify', method, params: notification.params});
    } catch {
      // ignore failures for notifications
    }
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
      if (this.connectionState$.getValue() === 'open') {
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
