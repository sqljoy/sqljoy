export declare const versionMajor = 0;
export declare const versionMinor = 10;
/**
 * These are defined as global variables by the compiler.
 */
declare global {
    const __VERSION_: string;
    const __ACCOUNT_ID_: string;
}
/**
 * Defines what to do about in-progress queries/calls if leaving the page or draining the SQLJoy client.
 *
 * @see {@link Settings.preventUnload} and {@link SQLJoy.drain} for more information.
 */
export declare enum WaitBehavior {
    /**
     * Wait for any queries/calls that are still buffered to send to the server.
     */
    WAIT_FOR_SEND = 0,
    /**
     * Wait for any queries/calls which have not returned a result from the server.
     */
    WAIT_FOR_ACK = 1,
    /**
     * Do not wait.
     */
    NEVER = 2
}
declare type JSONReviver = (this: any, key: string, value: any) => any;
/**
 * OnVersionChange is the type of the callback function used to
 * customize behavior when the deployed server version is different
 * to the current client version. The server pushes a notification
 * to connected clients with differing versions when a deploy occurs.
 */
export declare type OnVersionChange = (client_version: string, server_version: string) => void;
/**
 * Settings object to configure the SQLJoy client.
 */
export interface Settings {
    /**
     * The registered account id with SQLJoy. Required for managed cloud service and server discovery.
     *
     * @defaultValue window.__ACCOUNT_ID_, set in a global by the compiler
     *
     * @remarks It's free to create an account, no credit card required.
     */
    accountId?: string;
    /**
     * The version of the compiled application, stored in global __VERSION_ by the compiler.
     * If this doesn't match the __VERSION_ on the server, the versionChangeHandler will be invoked.
     *
     * @defaultValue window.__VERSION_ || "" (disabled)
     *
     * @see {@link versionChangeHandler} for more information.
     */
    version: string;
    /**
     * If using server discovery and health checks, this service can be request with a HTTP(s) GET
     * and returns a list of healthy SQLJoy servers for the configured account. If there's a connection
     * error, this will automatically be called to ensure a healthy server is chosen on reconnect.
     *
     * @defaultValue discover.sqljoy.com/accountId
     */
    discoveryUrl?: string;
    /**
     * If using server discovery, the amount of time in seconds to cache the list of healthy servers.
     * Analogous to TTL on DNS entries.
     *
     * @defaultValue 0
     */
    discoveryTTLSeconds: number;
    /**
     * A list of servers to connect to (chosen at random from this list).
     * If provided, the discovery service won't be used.
     *
     * @defaultValue []
     */
    servers: string[];
    /**
     * Controls registering a beforeunload handler to prompt the user before leaving the page
     * if there are queries/calls in-flight. Since these may be to save user data, navigating
     * away before they're completed can cause data loss for the user.
     *
     * @defaultValue {@link WaitBehavior.WAIT_FOR_SEND}.
     * @see {@link WaitBehavior} for the options.
     */
    preventUnload: WaitBehavior;
    /**
     * The versionChangeHandler is invoked when the server version changes compared to the client version.
     * Set to null to disable, or set to a custom function to customize the behavior.
     *
     * @defaultValue {@link defaultVersionChangeHandler}
     */
    versionChangeHandler: OnVersionChange | null;
    /**
     * The jsonReviver callback is passed to JSON.parse and works as documented here:
     * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse}
     */
    jsonReviver: JSONReviver;
    _valid: boolean;
    _lastServer: number;
}
/**
 * @internal
 * validateSettings sets default values and checks that the settings are valid.
 * It's invoked by the SQLClient constructor.
 *
 * @param settings
 */
export declare function validateSettings(settings: Partial<Settings>): Settings;
export {};
