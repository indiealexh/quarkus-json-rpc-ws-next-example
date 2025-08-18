import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection, APP_INITIALIZER, isDevMode } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { JSON_RPC_WS_URL, defaultJsonRpcWsUrlFactory } from './jsonrpc/json-rpc.tokens';
import { JsonRpcClientService } from './jsonrpc/json-rpc-client.service';
import { provideServiceWorker } from '@angular/service-worker';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    { provide: JSON_RPC_WS_URL, useFactory: defaultJsonRpcWsUrlFactory },
    {
      provide: APP_INITIALIZER,
      multi: true,
      deps: [JsonRpcClientService],
      useFactory: (jsonRpc: JsonRpcClientService) => () => {
        // Open WebSocket at app startup; reconnection is handled by the service
        jsonRpc.connect();
      }
    }, provideServiceWorker('ngsw-worker.js', {
            enabled: !isDevMode(),
            registrationStrategy: 'registerWhenStable:30000'
          })
  ]
};
