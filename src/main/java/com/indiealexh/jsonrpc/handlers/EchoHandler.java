package com.indiealexh.jsonrpc.handlers;

import com.indiealexh.jsonrpc.JsonRpcHandler;
import io.smallrye.mutiny.Uni;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.Map;

@ApplicationScoped
public class EchoHandler implements JsonRpcHandler<EchoParams, Map<String, Object>> {
    @Override
    public String method() {
        return "echo";
    }

    @Override
    public Class<EchoParams> paramsType() {
        return EchoParams.class;
    }

    @Override
    public Uni<Map<String, Object>> handle(EchoParams params) {
        return Uni.createFrom().item(Map.of("echo", params == null ? null : params.getMessage()));
    }
}
