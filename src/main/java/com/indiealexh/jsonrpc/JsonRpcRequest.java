package com.indiealexh.jsonrpc;

/**
 * JSON-RPC 2.0 Request model (simple POJO, optional usage)
 */
public class JsonRpcRequest {
    private String jsonrpc;
    private String method;
    private Object params; // Can be object, array, or omitted
    private Object id; // String, number, or null

    public String getJsonrpc() {
        return jsonrpc;
    }

    public void setJsonrpc(String jsonrpc) {
        this.jsonrpc = jsonrpc;
    }

    public String getMethod() {
        return method;
    }

    public void setMethod(String method) {
        this.method = method;
    }

    public Object getParams() {
        return params;
    }

    public void setParams(Object params) {
        this.params = params;
    }

    public Object getId() {
        return id;
    }

    public void setId(Object id) {
        this.id = id;
    }
}
