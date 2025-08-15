package com.indiealexh.jsonrpc.handlers.echo;

public class EchoParams {
    private String message;

    public EchoParams() {}

    public EchoParams(String message) {
        this.message = message;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }
}
