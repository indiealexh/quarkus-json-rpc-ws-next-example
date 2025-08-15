package com.indiealexh.jsonrpc;

/**
 * JSON-RPC 2.0 Response model
 */
public class JsonRpcResponse {
    private String jsonrpc = "2.0";
    private Object result; // present on success
    private JsonRpcError error; // present on error
    private Object id;

    public String getJsonrpc() {
        return jsonrpc;
    }

    public void setJsonrpc(String jsonrpc) {
        this.jsonrpc = jsonrpc;
    }

    public Object getResult() {
        return result;
    }

    public void setResult(Object result) {
        this.result = result;
    }

    public JsonRpcError getError() {
        return error;
    }

    public void setError(JsonRpcError error) {
        this.error = error;
    }

    public Object getId() {
        return id;
    }

    public void setId(Object id) {
        this.id = id;
    }
}
