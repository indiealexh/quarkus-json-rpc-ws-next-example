package com.indiealexh.jsonrpc;

import io.smallrye.mutiny.Uni;

/**
 * JSON-RPC handler for a specific method with a typed params payload.
 * @param <P> Params type (must be mappable from a JSON object)
 * @param <R> Result type (will be JSON-encoded in the response)
 */
public interface JsonRpcHandler<P, R> {
    /** The JSON-RPC method name this handler supports. */
    String method();

    /** The parameters type for mapping the incoming params object. */
    Class<P> paramsType();

    /** Handle the request asynchronously. */
    Uni<R> handle(P params);
}
