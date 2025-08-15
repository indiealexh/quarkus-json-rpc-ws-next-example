package com.indiealexh.jsonrpc.handlers.reverse;

import com.indiealexh.jsonrpc.JsonRpcHandler;
import io.smallrye.mutiny.Uni;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.Map;

@ApplicationScoped
public class ReverseHandler implements JsonRpcHandler<ReverseParams, Map<String, Object>> {
    @Override
    public String method() {
        return "reverse";
    }

    @Override
    public Class<ReverseParams> paramsType() {
        return ReverseParams.class;
    }

    @Override
    public Uni<Map<String, Object>> handle(ReverseParams params) {
        return Uni.createFrom().item(Map.of("reverse", params == null ? null : new StringBuilder(params.getMessage()).reverse().toString()));
    }
}
