package com.indiealexh;

import com.indiealexh.jsonrpc.JsonRpcRouter;
import io.quarkus.websockets.next.OnTextMessage;
import io.quarkus.websockets.next.WebSocket;
import io.smallrye.mutiny.Uni;
import io.vertx.core.json.JsonObject;
import jakarta.inject.Inject;

@WebSocket(path = "/api/ws")
public class WSService {

    @Inject
    JsonRpcRouter router;

    @OnTextMessage
    Uni<String> consume(JsonObject message) {
        return router.route(message);
    }
}
