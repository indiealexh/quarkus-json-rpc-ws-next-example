package com.indiealexh.jsonrpc.handlers.reverse;

public class ReverseParams {
    private String message;

    public ReverseParams() {}

    public ReverseParams(String message) {
        this.message = message;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }
}
