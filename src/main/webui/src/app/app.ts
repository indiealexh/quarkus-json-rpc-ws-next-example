import { Component, ChangeDetectorRef, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AsyncPipe } from '@angular/common';
import { JsonRpcClientService } from './jsonrpc/json-rpc-client.service';
import {Button} from 'primeng/button';
import {InputText} from 'primeng/inputtext';

@Component({
  selector: 'nosignal-root',
  imports: [RouterOutlet, FormsModule, AsyncPipe, Button, InputText],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  protected title = 'nosignal';

  // Expose connection state to the template via getter to avoid DI timing issues
  public get connectionState$() { return this.jsonRpc.state$; }

  message = '';
  operation: 'echo' | 'reverse' = 'echo';
  loading = false;
  result: string | null | undefined = undefined;
  error: string | null = null;

  // Inject the JSON-RPC client; consumers can call connect() when needed.
  constructor(private readonly jsonRpc: JsonRpcClientService, private readonly cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    // Initiate the WebSocket connection so the status indicator reflects real-time state
    this.jsonRpc.connect();
  }

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
