import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { JsonRpcClientService } from './jsonrpc/json-rpc-client.service';

@Component({
  selector: 'nosignal-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected title = 'nosignal';

  // Inject the JSON-RPC client; consumers can call connect() when needed.
  constructor(private readonly jsonRpc: JsonRpcClientService) {}
}
