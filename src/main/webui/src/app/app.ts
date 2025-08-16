import { Component, ChangeDetectorRef } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { JsonRpcClientService } from './jsonrpc/json-rpc-client.service';

@Component({
  selector: 'nosignal-root',
  imports: [RouterOutlet, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected title = 'nosignal';

  message = '';
  operation: 'echo' | 'reverse' = 'echo';
  loading = false;
  result: string | null | undefined = undefined;
  error: string | null = null;

  // Inject the JSON-RPC client; consumers can call connect() when needed.
  constructor(private readonly jsonRpc: JsonRpcClientService, private readonly cdr: ChangeDetectorRef) {}

  async onSubmit(): Promise<void> {
    this.error = null;
    this.result = undefined;
    const msg = this.message ?? '';
    if (!msg.trim() || this.loading) return;

    this.loading = true;
    try {

      console.debug('JSON-RPC call:', this.operation, msg);

      const method = this.operation;
      const response = await this.jsonRpc.call<{ echo?: string | null; reverse?: string | null }>(method, { message: msg });

      const value = method === 'echo' ? response?.echo : response?.reverse;
      this.result = value !== undefined && value !== null ? String(value) : 'null';
    } catch (e: any) {
      this.error = e?.message ?? String(e);
    } finally {
      this.loading = false;
      // Zoneless CD: ensure the view updates after async operations
      this.cdr.detectChanges();
    }
  }
}
