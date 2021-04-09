import {getServerUrl, PreventUnload, Settings, validateSettings} from "./config.js";
import {SQL} from "./sql.js";
import {validate, ValidationError, ValidationErrors, Validator} from "./validation";
import {Result} from "./result.js";
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
 * The client supports pipelining queries and server calls.
 *
 * @remarks It's possible to create multiple client instance, but usually this just causes
 * additional server utilization for no benefit.
 */
class SQLJoy {
    url: string;
    settings: Settings;
    closed: boolean;
    connecting: boolean;
    protected unloadRegistered: ((ev: Event) => string | undefined) | null;
    protected sock: WebSocket | null;
    protected queries: Record<number, QueryInProgress> = {}; // request id: response
    protected idSequence: number = 0; // request id generator

    /**
     * Creates a SQLJoy client and initiates a connection to the server.
     *
     * @param settings - client configuration and options
     */
    constructor(settings: Partial<Settings>) {
        this.settings = validateSettings(settings);
        this.url = "";
        this.sock = null;
        this.closed = false;
        this.connecting = false;
        this.unloadRegistered = null;
        this.connect();
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
     * @remarks The parameters passed to the validator will be the expressions embedded in the query
     * e.g. sql`select * from foo where id = ${foo.id}` will add a parameter "foo.id": value to the
     * parameters object. Expressions or literals like ${foo + 1} will be named as positional arguments
     * starting at "$1". Late-bound parameters using the %{param} syntax must be provided in the
     * params argument to this function or it will throw a ValidationError. The validators will
     * be executed again on the server side to ensure they cannot be bypassed. Validators can
     * change the type or values of the query parameters.
     *
     * @throws ValidationError if any of the validators fail.
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
     * may not yet be sent to the server. To avoid losing user changes, this method waits for buffered messages to be sent
     * before closing the underlying transport. If that behavior is undesirable, pass force=true when calling this.
     *
     * @param force - close transport immediately, do not send buffered data.
     */
    async close(force: boolean = false) {
        if (this.closed) {
            return;
        }
        this.closed = true;

        while (!force && this.sock !== null && this.sock.readyState !== this.sock.CLOSED && this.sock.readyState !== this.sock.CLOSING) {
            if (this.sock.bufferedAmount === 0) {
                break;
            } else {
                await wait(10);
            }
        }

        if (this.sock !== null) {
            this.sock.close();
            this.sock = null;
        }
        // TODO does onClose get invoked here? If not, we need to call it ourselves.
    }

    /**
     * pendingCount() returns the number of queries or commands still awaiting results from the server
     */
    pendingCount(): number {
        let count = 0;
        for(let id in this.queries) {
            if (this.queries.hasOwnProperty(id)) {
                count++;
            }
        }
        return count;
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
        this.updateUnloadHandler();
    }

    protected onMsg(e: MessageEvent) {
        this.updateUnloadHandler();

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

    // The "beforeunload" code here exists to handle the case where the user navigates away
    // from the page after sending commands on the WebSocket transport, but before waiting
    // for the results. There can be a situation where some of those commands are to save
    // user data, but they're still buffered on the WebSocket and haven't been sent to the
    // server. settings.preventDefault can be set to NEVER, WAIT_FOR_SEND, and WAIT_FOR_ACKNOWLEDGEMENT.
    // NEVER disables all this logic, WAIT_FOR_SEND waits for buffered data to be sent,
    // and WAIT_FOR_ACKNOWLEDGEMENT waits until all results have been received from the server.
    //
    // The beforeunload event is kind of hairy, best practices are to only register a handler
    // when there actually is unsaved data, and then to clear it again as soon as possible.
    // So this is the approach that we take, and only if the feature is enabled.
    //
    // We update the beforeunload handler after every sent and received message.

    protected onUnload(ev: Event): string | undefined {
        let pending = this.sock !== null && this.sock.bufferedAmount !== 0 && this.sock.readyState === this.sock.OPEN;
        if (!pending && this.settings.preventUnload === PreventUnload.WAIT_FOR_ACKNOWLEDGEMENT && this.pendingCount() !== 0) {
            pending = true;
        }

        if (!pending) {
            this.clearUnload();
            return;
        }

        ev.preventDefault();
        let msg = "There is unsaved data in transit that may be lost. Are you sure you want to leave?";
        // @ts-ignore
        ev.returnValue = msg;
        return msg;
    }

    protected updateUnloadHandler() {
        if (this.settings.preventUnload === PreventUnload.NEVER) {
            return;
        }

        let clear = false;
        if (this.sock === null) {
            clear = true;
        } else if (this.sock.readyState !== this.sock.OPEN) {
            clear = true;
        } else if (this.sock.bufferedAmount === 0) {
            if (this.settings.preventUnload === PreventUnload.WAIT_FOR_SEND) {
                clear = true;
            } else if (this.pendingCount() === 0) {
                clear = true;
            }
        }

        if (clear) {
            this.clearUnload();
        } else {
            this.setUnload();
        }
    }

    protected clearUnload() {
        if (this.unloadRegistered === null) {
            return;
        }

        removeEventListener("beforeunload", this.unloadRegistered, {capture: true});
        this.unloadRegistered = null;
    }

    protected setUnload() {
        if (this.unloadRegistered !== null) {
            return;
        }

        this.unloadRegistered = this.onUnload.bind(this);
        addEventListener("beforeunload", this.unloadRegistered, {capture: true});
    }
}