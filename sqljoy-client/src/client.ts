import {Settings, validateSettings, WaitBehavior} from "./config.js";
import {getServerUrl} from "./discover";
import {SQL} from "./sql.js";
import {validate, ValidationError, Validator} from "./validation";
import {Result} from "./result.js";
import {addClient, removeClient, defaultVersionChangeHandler} from "./registry";
import {updateUnloadHandler} from "./unload";
import {isString, wait} from "./util.js";

enum CommandType {
    QUERY = "Q",
    CALL = "C",
}

/**
 * Call is an object created by the sqljoy compiler, describing a compiled reference to a server function.
 */
export interface Call {
    /**
     * A 30 character base64-encoded hash identifying the server function
     */
    func: string;
}

/**
 * ConnectionError is thrown if the transport connection is interrupted during a query/call.
 *
 * @remarks The client is still usable, and subsequent queries/calls will establish a new connection.
 * You may want to retry the task, but be careful if it's not idempotent - it could have already executed
 * on the server before the connection was interrupted.
 */
class ConnectionError extends Error {
    constructor(message: string = "connection closed") {
        super(message);
        this.name = "ConnectionError";
    }
}

class QueryInProgress {
    resolve: (result: Result | any) => void;
    reject: (reason: Error) => void;

    constructor(resolve: (result: Result | any) => void, reject: (reason: Error) => void) {
        this.resolve = resolve;
        this.reject = reject;
    }

    cancel() {
        this.reject(new ConnectionError());
    }
}

/**
 * SQLJoy represents a single client connection to the server.
 *
 * The client supports concurrent asynchronous queries and server calls.
 *
 * @remarks It's possible to create multiple client instances, but usually this just causes
 * additional server utilization for no benefit. Prefer using this is a global singleton.
 */
export class SQLJoy {
    /**
     * The url of the server this client is connected to.
     */
    url: string;
    /**
     * The settings object this client was created with.
     */
    settings: Settings;
    /**
     * True if close() has been called. The client may not be used further in that case.
     */
    closed: boolean;
    /**
     * True if the client is in the process of connecting to the server.
     */
    connecting: boolean;
    protected unloadRegistered: ((ev: Event) => string | undefined) | null;
    protected sock: WebSocket | null;
    protected queries: Record<number, QueryInProgress> = {}; // request id: response
    protected idSequence: number = 0; // request id generator

    /**
     * Creates a SQLJoy client and initiates a connection to the server.
     *
     * @remarks Except for advanced use cases, you should use the getClient() function
     * instead, which returns a singleton instance of this class.
     *
     * @param settings - client configuration and options
     */
    constructor(settings: Partial<Settings>) {
        if (settings.versionChangeHandler === undefined) {
            settings.versionChangeHandler = defaultVersionChangeHandler;
        }
        this.settings = validateSettings(settings);
        this.url = "";
        this.sock = null;
        this.closed = false;
        this.connecting = false;
        this.unloadRegistered = null;
        this.connect();
        addClient(this);
    }

    /**
     * ready returns a promise that resolves once the underlying transport is connected and ready for use.
     *
     * @remarks It is not necessary to explicitly use this method, it is used internally by other methods
     * in this class. However, it's exposed because it may be useful when displaying a spinner or other
     * progress indicator while establishing a connection to the server.
     *
     * @throws Error if close() has been called.
     */
    async ready() {
        if (this.closed) {
            throw Error("attempt to send on closed connection");
        }
        if (this.sock === null) {
            console.warn("improve latency by calling the connect() method ahead of using the SQLJoy connection");
            await this.connect();
        } else if (this.sock.readyState === this.sock.CLOSED || this.sock.readyState === this.sock.CLOSING) {
            // This can't happen, anywhere we close the this.sock, we also set it to null.
            throw Error("WebSocket connection should not be in closing state");
        }

        while (this.sock!.readyState === this.sock!.CONNECTING) {
            // User didn't wait for connect() to complete, we support that
            await wait(5);
        }
    }

    /**
     * executeQuery executes a compiled query (SQL) object with the optional additional named parameters
     * and validators and returns a promise resolving to a Result object.
     *
     * The parameters passed to the validator will be the expressions embedded in the query
     * e.g. sql`select * from foo where id = ${foo.id}` will add a parameter "foo.id": value to the
     * parameters object. Expressions or literals like ${foo + 1} will be named as positional arguments
     * starting at "$1". Late-bound parameters using the %{param} syntax must be provided in the
     * params argument to this function or it will throw a ValidationError. If any parameter is undefined
     * this throws a ValidationError. Use null if you mean null (simply ${param || null} will work.)
     * The validators will be executed again on the server side to ensure they cannot be bypassed.
     * Validators can change the type or values of the query parameters. Validators can also be async
     * functions and can perform queries or fetch requests.
     *
     * @remarks It's also possible to call validators with {@link validate} without executing the query (e.g. to display
     * feedback for a form.)
     *
     * @throws {@link ValidationError} if any of the validators fail.
     *
     * @param query the compiled SQL query to execute
     * @param params override bound ${expr} parameters or specify late-bound %{name} query parameters
     * @param validators zero or more validator functions that will run on both client and server
     */
    async executeQuery(query: SQL, params?: Record<string, any>, ...validators: Validator[]): Promise<Result> {
        if (query.query === "invalid") {
            throw Error(`attempt to execute uncompiled query, refer to the compiler warning for more info: ${query.text || query.query}`);
        }

        let allParams = Object.assign({}, query.params, params);

        // This is the client-side validation. We also extract these functions and validParams
        // through the whitelist compiler and save them with the query whitelist so the server
        // can run them again. Note that we can't simply pass that information through from here
        // as the client is untrusted.
        const errors = await validate(query, allParams, validators);
        if (errors != null) {
            throw new ValidationError(errors);
        }

        // The validators can modify params, but on the client we need to discard those
        // changes so that the server-side validators receive the same input.
        allParams = (params) ? Object.assign({}, query.params, params) : query.params;

        return this.sendCommand(CommandType.QUERY, query.query, allParams);
    }

    /**
     * serverCall executes the target function on the server with the passed arguments
     * and returns the decoded JSON result or Result object or throws the returned error.
     *
     * @remarks serverCall should not be invoked directly, rather server calls matching the
     * pattern func(client.beginTx(), ...) will be transformed by the compiler into calls to this method.
     * All arguments must be serializable as JSON with JSON.stringify, or an Error will be thrown.
     *
     * @param target The compiled target to call
     * @param args The JSON serializable arguments to pass to the target function
     */
    async serverCall(target: Call, ...args: any[]): Promise<any> {
        return this.sendCommand(CommandType.CALL, target.func, args);
    }

    /**
     * Close terminates the connection to the server (if any). This client object cannot be used again afterwards.
     *
     * @remarks If using WebSocket transport, queries (inserts/updates) or server calls that have been issued
     * may not yet be sent to the server. To avoid losing user changes, call the drain() method first.
     */
    close() {
        if (this.closed) {
            return;
        }
        this.closed = true;

        if (this.sock !== null) {
            this.sock.close();
            this.sock = null;
        }
        // TODO does onClose get invoked here? If not, we need to call it ourselves.

        removeClient(this);
    }

    /**
     * Wait for pending queries/calls according to the waitFor parameter.
     *
     * @example Wait for queries before closing.
     * `
     * async function redirect(url: string) {
     *     await client.drain();
     *     client.close();
     *     window.location.href = url;
     * }
     * `
     *
     * @param waitFor whether to wait for requests to send or to complete. Defaults to WAIT_FOR_ACK.
     * Passing NEVER causes this method to return immediately.
     */
    async drain(waitFor: WaitBehavior = WaitBehavior.WAIT_FOR_ACK): Promise<void> {
        while (this.hasPending(waitFor)) {
            await wait(5);
        }
    }

    /**
     * hasPending returns true if there are pending requests that are in progress according
     * to the specified WaitBehavior or settings.preventUnload if omitted.
     *
     * @param waitFor - the WaitBehavior to determine what kind of pending requests sho
     */
    hasPending(waitFor?: WaitBehavior): boolean {
        waitFor ||= this.settings.preventUnload;
        if (waitFor === WaitBehavior.NEVER) {
            return false;
        }
        // Check if we have a valid connection, otherwise we're going to discard all pending requests anyway on the next connect().
        if (this.sock == null || this.sock.readyState === this.sock.CLOSED || this.sock.readyState === this.sock.CLOSING) {
            return false;
        }
        // If waitFor === WaitBehavior.WAIT_FOR_ACK, check if hasPending(), otherwise check if anything if buffered
        return (waitFor === WaitBehavior.WAIT_FOR_ACK && this.hasPendingResult()) || this.sock.bufferedAmount !== 0;
    }

    /**
     * hasPendingResult() returns true if there are queries or commands still awaiting results from the server.
     *
     * @see also {@link hasPending} which is more precise.
     */
    protected hasPendingResult(): boolean {
        for(let id in this.queries) {
            if (this.queries.hasOwnProperty(id)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Initiate a connection the server. Called from the constructor.
     *
     * @remarks Returns immediately, before the connection is established.
     * It is not necessary to call this method, but doing so in
     * advance of using the client reduces the apparent latency of the
     * first usage(s).
     */
    protected connect() {
        if (this.connecting) {
            return;
        }

        this.connecting = true;
        const self = this;
        getServerUrl(this.settings).then((url) => {
            self.url = url;
            const sock = new WebSocket(url);
            self.connecting = false;
            sock.onclose = self.onClose.bind(self);
            sock.onerror = self.onError.bind(self);
            sock.onmessage = self.onMsg.bind(self);
            self.sock = sock;
        }).catch(() => this.connecting = false);
    }

    protected sendCommand(cmd: CommandType, target: string, args: Record<string, any> | any[]): Promise<Result> {
        const id = ++this.idSequence;
        // We don't need to send requests with the binary protocol.
        // Most requests are small and the code size increase and processing time increase aren't worth it.
        // This also means the server only needs to accept the text protocol.
        //
        // Both text and binary frames have the length encoded at the start of the frame,
        // so there is no performance difference for the server.
        const msg = `${cmd}${id};${target};${JSON.stringify(args)}`;
        const promise = new Promise<Result>((resolve, reject) => {
            this.queries[id] = new QueryInProgress(resolve, reject);
        });
        this.send(msg);
        return promise;
    }

    protected send(msg: string) {
        const onReady = this.doSend.bind(this, msg);
        this.ready().then(onReady);
    }

    protected doSend(msg: string) {
        if (this.closed || this.sock === null || this.sock.readyState !== this.sock.OPEN) {
            return;
        }
        this.sock.send(msg);
        if (this.settings.preventUnload !== WaitBehavior.NEVER) {
            updateUnloadHandler();
        }
    }

    protected onMsg(e: MessageEvent) {
        if (this.settings.preventUnload !== WaitBehavior.NEVER) {
            updateUnloadHandler();
        }

        let id = 0;
        let error = "";
        let result: Result | any = null;

        if (isString(e.data)) {
            const msg = JSON.parse(e.data);
            id = msg.id;
            if (msg.error) {
                error = msg.error;
            } else if (msg.result) {
                result = msg.result;
            } else {
                result = new Result(msg.columns, msg.rows);
            }
        } else {
            // TODO binary protocol
            throw Error("binary protocol not implemented");
        }

        const promise = this.queries[id];
        if (promise === undefined) {
            // This event has no associated request, it must have been server initiated
            if (result !== null && result.eventType != null) {
                // This is a server "push" event, call the registered handler
                console.warn("server initiated events not yet implemented");
            }
            return;
        }

        delete this.queries[id];
        if (error.length !== 0) {
            promise.reject(Error(error));
        } else {
            promise.resolve(result!);
        }
    }

    protected onError(e: Event) {
        console.warn("error from WebSocket", e);
        if (this.sock !== null) {
            this.sock.close();
            this.sock = null;
        }
    }

    protected onClose(e: CloseEvent) {
        for(let id in this.queries) {
            if (this.queries.hasOwnProperty(id)) {
                const q = this.queries[id];
                q.cancel();
            }
        }
        this.queries = {};
        this.sock = null;
    }
}