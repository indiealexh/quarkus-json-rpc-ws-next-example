package com.indiealexh;

import com.indiealexh.jsonrpc.JsonRpcRouter;
import io.quarkus.websockets.next.OnTextMessage;
import io.quarkus.websockets.next.WebSocket;
import io.smallrye.mutiny.Uni;
import jakarta.inject.Inject;

@WebSocket(path = "/api/ws")
public class WSService {

    @Inject
    JsonRpcRouter router;

    @OnTextMessage
    Uni<String> consume(String message) {
        // Accept either a single JSON-RPC object or a batch array encoded as a string
        return router.route(message);
    }
}
