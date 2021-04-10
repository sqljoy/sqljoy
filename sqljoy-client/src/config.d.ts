/**
 * These are defined as global variables by the compiler.
 */
declare global {
    const __VERSION_: number;
    const __ACCOUNT_ID_: string;
}
/**
 * Defines what to do about in-progress queries/calls if leaving the page or closing the SQLJoy client.
 *
 * @see {@link Settings.preventUnload} and {@link SQLJoy.close} for more information.
 */
export declare enum WaitBehavior {
    /**
     * Enabled. Registers an event handler that prompts the user to stay while there are still queries/calls buffered to send to the server.
     */
    WAIT_FOR_SEND = 0,
    /**
     * Enabled. Registers an event handler that prompts the user to stay while there are still queries/calls which have not returned a result.
     */
    WAIT_FOR_ACK = 1,
    /**
     * Disabled. Does not register any beforeunload event handler.
     */
    NEVER = 2
}
export declare type OnVersionChange = (client_version: number, server_version: number) => void;
/**
 * Settings object to configure the SQLJoy client.
 */
export interface Settings {
    /**
     * The registered account id with SQLJoy. Required for managed cloud service and server discovery.
     * This defaults to window.__ACCOUNT_ID_, set in a global by the compiler.
     *
     * @remarks It's free to create an account, no credit card required.
     */
    accountId?: string;
    /**
     * The version number of the compiled application, stored in global __VERSION_ by the compiler.
     *
     * Defaults to window.__VERSION_ || 0 (disabled).
     *
     * If this doesn't match the __VERSION__ on the server, the versionChangeHandler will be invoked.
     *
     * @see {@link versionChangeHandler} for more information.
     */
    version: number;
    /**
     * If using server discovery and health checks, this service can be request with a HTTP(s) GET
     * and returns a list of healthy SQLJoy servers for the configured account. If there's a connection
     * error, this will automatically be called to ensure a healthy server is chosen on reconnect.
     */
    discoveryUrl?: string;
    /**
     * If using server discovery, the amount of time in seconds to cache the list of healthy servers.
     * Analogous to TTL on DNS entries.
     */
    discoveryTTLSeconds: number;
    servers: string[];
    /**
     * Controls registering a beforeunload handler to prompt the user before leaving the page
     * if there are queries/calls in-flight. Since these may be to save user data, navigating
     * away before they're completed can cause data loss for the user.
     *
     * Defaults to {@link WaitBehavior.WAIT_FOR_SEND}.
     * @see {@link WaitBehavior} for the options.
     */
    preventUnload: WaitBehavior;
    /**
     * The versionChangeHandler is invoked when the server version changes compared to the client version.
     * Set to null to disable, or set to a custom function to customize the behavior.
     *
     * @see {@link defaultVersionChangeHandler}
     */
    versionChangeHandler: OnVersionChange | null;
    _valid: boolean;
    _lastServer: number;
}
export declare function validateSettings(settings: Partial<Settings>): Settings;
