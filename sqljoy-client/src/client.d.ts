import { Settings, WaitBehavior } from "./config.js";
import { SQL } from "./sql.js";
import { Validator } from "./validation";
import { Result } from "./result.js";
export declare enum ClientStatus {
    NotConnected = 0,
    Connecting = 1,
    Open = 2,
    Active = 3,
    Closed = 4
}
declare enum CommandType {
    HELLO = "H",
    QUERY = "Q",
    CALL = "C"
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
declare class QueryInProgress {
    resolve: (result: Result | any) => void;
    reject: (reason: Error) => void;
    constructor(resolve: (result: Result | any) => void, reject: (reason: Error) => void);
    cancel(): void;
}
/**
 * SQLJoy represents a single client connection to the server.
 *
 * The client supports concurrent asynchronous queries and server calls.
 *
 * @remarks It's possible to create multiple client instances, but usually this just causes
 * additional server utilization for no benefit. Prefer using this is a global singleton
 * created through {@link getClient}.
 */
export declare class SQLJoy {
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
    protected connecting: boolean;
    protected connectedAt: number;
    protected lastId: number;
    protected unloadRegistered: ((ev: Event) => string | undefined) | null;
    protected sock: WebSocket | null;
    protected queries: Record<number, QueryInProgress>;
    /**
     * Creates a SQLJoy client and initiates a connection to the server.
     *
     * @remarks Except for advanced use cases, you should use the getClient() function
     * instead, which returns a singleton instance of this class.
     *
     * @param settings - client configuration and options
     */
    constructor(settings: Partial<Settings>);
    /**
     * ready returns a promise that resolves once the underlying transport is connected and ready for use.
     *
     * @remarks It is not necessary to explicitly use this method, it is used internally by other methods
     * in this class. However, it's exposed because it may be useful when displaying a spinner or other
     * progress indicator while establishing a connection to the server.
     *
     * @throws Error if close() has been called.
     */
    ready(): Promise<void>;
    /**
     * Returns the current status of this client connection.
     */
    status(): ClientStatus;
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
    executeQuery(query: SQL, params?: Record<string, any>, ...validators: Validator[]): Promise<Result>;
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
    serverCall(target: Call, ...args: any[]): Promise<any>;
    /**
     * Close terminates the connection to the server (if any). This client object cannot be used again afterwards.
     *
     * @remarks If using WebSocket transport, queries (inserts/updates) or server calls that have been issued
     * may not yet be sent to the server. To avoid losing user changes, call the drain() method first.
     */
    close(): void;
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
    drain(waitFor?: WaitBehavior): Promise<void>;
    /**
     * hasPending returns true if there are pending requests that are in progress according
     * to the specified WaitBehavior or settings.preventUnload if omitted.
     *
     * @param waitFor - the WaitBehavior to determine what kind of pending requests sho
     */
    hasPending(waitFor?: WaitBehavior): boolean;
    /**
     * hasPendingResult() returns true if there are queries or commands still awaiting results from the server.
     *
     * @see also {@link hasPending} which is more precise.
     */
    protected hasPendingResult(): boolean;
    /**
     * Initiate a connection the server. Called from the constructor.
     *
     * @remarks Returns immediately, before the connection is established.
     * It is not necessary to call this method, but doing so in
     * advance of using the client reduces the apparent latency of the
     * first usage(s).
     */
    protected connect(): void;
    protected onConnected(): void;
    protected sendCommand(cmd: CommandType, target: string, args: Record<string, any> | any[]): Promise<Result>;
    protected send(msg: string): void;
    protected doSend(msg: string): void;
    /**
     * Returns a monotonically increasing numeric id unique for this connection.
     *
     * Rather than store a timestamp of a request and a meaningless numeric id, we combine
     * them by using a monotonic timestamp as the id. This value represents milliseconds
     * passed since the connection was initiated.
     */
    protected nextId(): number;
    protected onMsg(e: MessageEvent): void;
    protected onError(e: Event): void;
    protected onClose(e: CloseEvent): void;
}
export {};
