# quarkus json-rpc WebSocket-next example

Quarkus Java Application Framework: <https://quarkus.io/>.

Quarkus Websocket-next extension: <https://quarkus.io/guides/websockets-next-reference>

## Running the application in dev mode

You can run your application in dev mode that enables live coding using:

```shell script
./mvnw quarkus:dev
```

> **_NOTE:_**  Quarkus now ships with a Dev UI, which is available in dev mode only at <http://localhost:8080/q/dev/>.

## Features

- WebSocket JSON-RPC 2.0 endpoint exposed at `/api/ws` (ws:// in dev, wss:// behind HTTPS)
- Supported methods: `echo` and `reverse`
- Angular Web UI (under `src/main/webui`) with a basic form to call `echo`/`reverse`
- Client-side WebSocket JSON-RPC service that auto-connects on app start and automatically reconnects with exponential backoff
- Clear loading, result, and error display in the UI

## Accessing the Web UI

1. Start the app in dev mode:
   ```shell
   ./mvnw quarkus:dev
   ```
2. Open the browser at: http://localhost:4200
3. Use the form on the page:
   - Type your message
   - Choose the operation (Echo or Reverse)
   - Click Send
   - A "Loading..." indicator will appear, and then the result will be shown below the form

Notes:
- The Web UI’s JSON-RPC client derives the WebSocket endpoint from the current page origin: `ws(s)://<host>/api/ws`. When served over HTTPS it will use `wss://` automatically.
- The default comes from an Angular InjectionToken provider. If you need to customize it, see `src/main/webui/src/app/jsonrpc/json-rpc.tokens.ts` and the provider wiring in `src/main/webui/src/app/app.config.ts`.

## Interacting via HTTP client files

See `httpClientRequests/example.http` for examples of how to interact with the application.

### AsyncAPI specification

An AsyncAPI 3.0 document describing the WebSocket JSON-RPC API is available at `asyncapi.yaml`. You can view it using tools like the AsyncAPI Studio or the AsyncAPI CLI.

## Packaging and running the application

The application can be packaged using:

```shell script
./mvnw package
```

It produces the `quarkus-run.jar` file in the `target/quarkus-app/` directory.
Be aware that it’s not an _über-jar_ as the dependencies are copied into the `target/quarkus-app/lib/` directory.

The application is now runnable using `java -jar target/quarkus-app/quarkus-run.jar`.

If you want to build an _über-jar_, execute the following command:

```shell script
./mvnw package -Dquarkus.package.jar.type=uber-jar
```

The application, packaged as an _über-jar_, is now runnable using `java -jar target/*-runner.jar`.

## Creating a native executable

You can create a native executable using:

```shell script
./mvnw package -Dnative
```

Or, if you don't have GraalVM installed, you can run the native executable build in a container using:

```shell script
./mvnw package -Dnative -Dquarkus.native.container-build=true
```

You can then execute your native executable with: `./target/nosignal-server-1.0.0-SNAPSHOT-runner`

If you want to learn more about building native executables, please consult <https://quarkus.io/guides/maven-tooling>.

## Related Guides

- Mutiny ([guide](https://quarkus.io/guides/mutiny-primer)): Write reactive applications with the modern Reactive Programming library Mutiny
- REST ([guide](https://quarkus.io/guides/rest)): A Jakarta REST implementation utilizing build time processing and Vert.x. This extension is not compatible with the quarkus-resteasy extension, or any of the extensions that depend on it.
- Flyway ([guide](https://quarkus.io/guides/flyway)): Handle your database schema migrations
- YAML Configuration ([guide](https://quarkus.io/guides/config-yaml)): Use YAML to configure your Quarkus application
- JDBC Driver - PostgreSQL ([guide](https://quarkus.io/guides/datasource)): Connect to the PostgreSQL database via JDBC
- Eclipse Vert.x ([guide](https://quarkus.io/guides/vertx)): Write reactive applications with the Vert.x API
- WebSockets Next ([guide](https://quarkus.io/guides/websockets-next-reference)): Implementation of the WebSocket API with enhanced efficiency and usability
- Hibernate Validator ([guide](https://quarkus.io/guides/validation)): Validate object properties (field, getter) and method parameters for your beans (REST, CDI, Jakarta Persistence)
- REST Jackson ([guide](https://quarkus.io/guides/rest#json-serialisation)): Jackson serialization support for Quarkus REST. This extension is not compatible with the quarkus-resteasy extension, or any of the extensions that depend on it
- Jacoco - Code Coverage ([guide](https://quarkus.io/guides/tests-with-coverage)): Jacoco test coverage support
- OpenID Connect ([guide](https://quarkus.io/guides/security-openid-connect)): Verify Bearer access tokens and authenticate users with Authorization Code Flow
- Reactive PostgreSQL client ([guide](https://quarkus.io/guides/reactive-sql-clients)): Connect to the PostgreSQL database using the reactive pattern

## Provided Code

### YAML Config

Configure your application with YAML

[Related guide section...](https://quarkus.io/guides/config-reference#configuration-examples)

The Quarkus application configuration is located in `src/main/resources/application.yml`.

### REST

Easily start your REST Web Services

[Related guide section...](https://quarkus.io/guides/getting-started-reactive#reactive-jax-rs-resources)
