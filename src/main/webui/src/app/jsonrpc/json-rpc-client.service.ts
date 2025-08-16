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
  private idCounter = 0;
  private pending = new Map<string | number, PendingRequest>();

  private connectionState$ = new BehaviorSubject<ConnectionState>('idle');
  private notifications$ = new Subject<JsonRpcNotification>();

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

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      // If same URL, do nothing
      try {
        const currentUrl = (this.ws as any).url as string | undefined;
        if (currentUrl === target) return;
      } catch {
        // ignore
      }
      this.close(1000, 'Reconnecting to different URL');
    }

    this.connectionState$.next('connecting');
    const ws = new WebSocket(target);
    this.ws = ws;

    ws.onopen = () => {
      this.connectionState$.next('open');
    };

    ws.onclose = () => {
      this.connectionState$.next('closed');
      // Reject all pending
      this.pending.forEach((p) => p.reject(new Error('WebSocket closed')));
      this.pending.clear();
    };

    ws.onerror = () => {
      this.connectionState$.next('error');
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
  call<T = any>(method: string, params?: Record<string, any>, timeoutMs = 15000): Promise<T> {
    const ws = this.ensureOpen();
    const id = ++this.idCounter;
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

  /** Waits for the connection to open before resolving */
  waitForOpen(): Promise<void> {
    return new Promise((resolve, reject) => {
      const sub = this.state$
        .pipe(filter((s) => s === 'open' || s === 'closed' || s === 'error'))
        .subscribe((s) => {
          if (s === 'open') {
            sub.unsubscribe();
            resolve();
          } else if (s === 'closed' || s === 'error') {
            sub.unsubscribe();
            reject(new Error('WebSocket is not open'));
          }
        });
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
      const pending = this.pending.get(response.id as any);
      if (pending) {
        if ('result' in response) {
          pending.resolve(response.result);
        } else {
          const err = response as JsonRpcErrorResponse;
          const error = new Error(err.error?.message ?? 'JSON-RPC error');
          (error as any).code = err.error?.code;
          (error as any).data = err.error?.data;
          pending.reject(error);
        }
        if (pending.timeoutId) clearTimeout(pending.timeoutId);
        this.pending.delete(response.id as any);
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
}
