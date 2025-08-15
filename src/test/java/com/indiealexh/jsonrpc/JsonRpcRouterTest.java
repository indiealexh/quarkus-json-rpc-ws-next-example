package com.indiealexh.jsonrpc;

import com.indiealexh.jsonrpc.handlers.echo.EchoHandler;
import io.vertx.core.json.JsonObject;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

public class JsonRpcRouterTest {

    private final JsonRpcRouter router = new JsonRpcRouter(new EchoHandler());

    @Test
    void echoHandlerShouldReturnResult() {
        JsonObject msg = new JsonObject()
                .put("jsonrpc", "2.0")
                .put("id", 1)
                .put("method", "echo")
                .put("params", new JsonObject().put("message", "hello"));

        String response = router.route(msg).await().indefinitely();
        assertNotNull(response, "Response should not be null for requests with id");

        JsonObject resp = new JsonObject(response);
        assertEquals("2.0", resp.getString("jsonrpc"));
        assertEquals(1, resp.getInteger("id"));
        assertTrue(resp.containsKey("result"));
        JsonObject result = resp.getJsonObject("result");
        assertEquals("hello", result.getString("echo"));
        assertFalse(resp.containsKey("error"));
    }

    @Test
    void unknownMethodShouldReturnMethodNotFoundError() {
        JsonObject msg = new JsonObject()
                .put("jsonrpc", "2.0")
                .put("id", "abc")
                .put("method", "does_not_exist");

        String response = router.route(msg).await().indefinitely();
        assertNotNull(response);
        JsonObject resp = new JsonObject(response);
        assertEquals("2.0", resp.getString("jsonrpc"));
        assertEquals("abc", resp.getString("id"));
        assertTrue(resp.containsKey("error"));
        JsonObject err = resp.getJsonObject("error");
        assertEquals(-32601, err.getInteger("code"));
    }

    @Test
    void notificationShouldReturnNull() {
        JsonObject msg = new JsonObject()
                .put("jsonrpc", "2.0")
                .put("method", "echo")
                .put("params", new JsonObject().put("message", "notify"));
        String response = router.route(msg).await().indefinitely();
        assertNull(response, "Notifications (no id) should produce no response");
    }

    @Test
    void invalidVersionShouldReturnInvalidRequest() {
        JsonObject msg = new JsonObject()
                .put("jsonrpc", "1.0")
                .put("id", 2)
                .put("method", "echo");
        String response = router.route(msg).await().indefinitely();
        assertNotNull(response);
        JsonObject resp = new JsonObject(response);
        assertEquals(2, resp.getInteger("id"));
        assertTrue(resp.containsKey("error"));
        JsonObject err = resp.getJsonObject("error");
        assertEquals(-32600, err.getInteger("code"));
    }
}
