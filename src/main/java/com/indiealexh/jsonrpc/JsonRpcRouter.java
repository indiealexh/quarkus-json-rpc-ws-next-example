package com.indiealexh.jsonrpc;

import io.smallrye.mutiny.Uni;
import io.vertx.core.json.Json;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.enterprise.inject.Instance;

import java.util.HashMap;
import java.util.Map;

/**
 * Routes JSON-RPC 2.0 requests to registered handlers.
 */
@ApplicationScoped
public class JsonRpcRouter {

    private final Map<String, JsonRpcHandler<?, ?>> handlersByMethod = new HashMap<>();

    public JsonRpcRouter() {
        // CDI
    }

    /**
     * Convenience constructor for tests or manual wiring.
     */
    public JsonRpcRouter(JsonRpcHandler<?, ?>... handlers) {
        if (handlers != null) {
            for (JsonRpcHandler<?, ?> h : handlers) {
                if (h != null) {
                    handlersByMethod.put(h.method(), h);
                }
            }
        }
    }

    @Inject
    public JsonRpcRouter(Instance<JsonRpcHandler<?, ?>> handlers) {
        for (JsonRpcHandler<?, ?> h : handlers) {
            handlersByMethod.put(h.method(), h);
        }
    }

    /**
     * Handle an incoming WebSocket JSON message as JSON-RPC 2.0.
     * Returns a Uni of JSON string response or null for notifications.
     */
    public Uni<String> route(JsonObject message) {
        boolean isNotification = !message.containsKey("id");
        Object id = message.getValue("id");

        // Validate basic JSON-RPC structure
        String version = message.getString("jsonrpc");
        if (!"2.0".equals(version)) {
            return respondError(isNotification, id, -32600, "Invalid Request", null);
        }

        String method = message.getString("method");
        if (method == null || method.isBlank()) {
            return respondError(isNotification, id, -32600, "Invalid Request: missing method", null);
        }

        @SuppressWarnings("unchecked")
        JsonRpcHandler<Object, Object> handler = (JsonRpcHandler<Object, Object>) handlersByMethod.get(method);
        if (handler == null) {
            return respondError(isNotification, id, -32601, "Method not found", null);
        }

        // Map params
        Object paramsValue = message.getValue("params");
        Object paramsObj;
        try {
            Class<?> pType = handler.paramsType();
            if (pType == Void.class || pType == Void.TYPE) {
                paramsObj = null;
            } else if (paramsValue == null) {
                paramsObj = new JsonObject().mapTo(pType);
            } else if (paramsValue instanceof JsonObject jo) {
                paramsObj = jo.mapTo(pType);
            } else if (paramsValue instanceof Map<?, ?> map) {
                paramsObj = new JsonObject((Map<String, Object>) map).mapTo(pType);
            } else if (paramsValue instanceof JsonArray) {
                // Positional params not supported by this minimal router
                return respondError(isNotification, id, -32602, "Invalid params: positional params not supported", null);
            } else {
                return respondError(isNotification, id, -32602, "Invalid params", null);
            }
        } catch (Throwable t) {
            return respondError(isNotification, id, -32602, "Invalid params", t.getMessage());
        }

        // Dispatch to handler
        return handler.handle(paramsObj)
                .onItem().transform(result -> buildSuccessJson(id, result))
                .onFailure().recoverWithItem(t -> buildErrorJson(id, -32603, "Internal error", t == null ? null : t.toString()))
                .onItem().transform(json -> isNotification ? null : json);
    }

    private Uni<String> respondError(boolean isNotification, Object id, int code, String message, Object data) {
        if (isNotification) {
            return Uni.createFrom().nullItem();
        }
        return Uni.createFrom().item(buildErrorJson(id, code, message, data));
    }

    private String buildSuccessJson(Object id, Object result) {
        JsonRpcResponse resp = new JsonRpcResponse();
        resp.setId(id);
        resp.setResult(result);
        return Json.encode(resp);
    }

    private String buildErrorJson(Object id, int code, String message, Object data) {
        JsonRpcResponse resp = new JsonRpcResponse();
        resp.setId(id);
        JsonRpcError err = new JsonRpcError(code, message, data);
        resp.setError(err);
        return Json.encode(resp);
    }
}
