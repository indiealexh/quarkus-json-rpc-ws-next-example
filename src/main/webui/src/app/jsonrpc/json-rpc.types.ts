export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, any> | undefined;
  id?: string | number | null; // If omitted -> notification
}

export interface JsonRpcSuccess<T = any> {
  jsonrpc: '2.0';
  id: string | number | null;
  result: T;
}

export interface JsonRpcErrorObject {
  code: -32700 | -32600 | -32601 | -32602 | -32603 | number;
  message: string;
  data?: any;
}

export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  error: JsonRpcErrorObject;
}

export type JsonRpcResponse<T = any> = JsonRpcSuccess<T> | JsonRpcErrorResponse;

export type JsonRpcNotification = Omit<JsonRpcRequest, 'id'> & { id?: undefined };

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
