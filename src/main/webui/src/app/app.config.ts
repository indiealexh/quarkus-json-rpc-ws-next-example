import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { JSON_RPC_WS_URL, defaultJsonRpcWsUrlFactory } from './jsonrpc/json-rpc.tokens';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    { provide: JSON_RPC_WS_URL, useFactory: defaultJsonRpcWsUrlFactory }
  ]
};
