import { InjectionToken } from '@angular/core';

export const JSON_RPC_WS_URL = new InjectionToken<string>('JSON_RPC_WS_URL');

export function defaultJsonRpcWsUrlFactory(): string {
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.host; // includes hostname:port
    return `${protocol}://${host}/api/ws`;
  }
  // Fallback for non-browser contexts
  return 'ws://localhost:8080/api/ws';
}
