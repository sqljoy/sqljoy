import {isString, isPromise, shuffleArray} from "./util.js";

/**
 * These are defined as global variables by the compiler.
 */
declare global {
    const __VERSION_: number;
    const __ACCOUNT_ID_: string;
}

/**
 * Defines what to do about in-progress queries/calls if leaving the page or draining the SQLJoy client.
 *
 * @see {@link Settings.preventUnload} and {@link SQLJoy.drain} for more information.
 */
export enum WaitBehavior {
    /**
     * Wait for any queries/calls that are still buffered to send to the server.
     */
    WAIT_FOR_SEND,
    /**
     * Wait for any queries/calls which have not returned a result from the server.
     */
    WAIT_FOR_ACK,
    /**
     * Do not wait.
     */
    NEVER
}

/**
 * OnVersionChange is the type of the callback function used to
 * customize behavior when the deployed server version is different
 * to the current client version. The server pushes a notification
 * to connected clients with differing versions when a deploy occurs.
 */
export type OnVersionChange = (client_version: number, server_version: number) => void;

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
     * The version number of the compiled application, stored in global __VERSION_ by the compiler.
     * If this doesn't match the __VERSION_ on the server, the versionChangeHandler will be invoked.
     *
     * @defaultValue window.__VERSION_ || 0 (disabled)
     *
     * @see {@link versionChangeHandler} for more information.
     */
    version: number;
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
     * @see {@link defaultVersionChangeHandler}
     */
    versionChangeHandler: OnVersionChange | null;
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
export function validateSettings(settings: Partial<Settings>): Settings {
    if (!settings) {
        throw Error("settings cannot be omitted");
    }
    if (settings._valid) {
        return settings as Settings;
    }
    settings.accountId ||= __ACCOUNT_ID_;

    if (!settings.discoveryUrl && !settings.servers) {
        throw Error("must provide either a discovery service or a list of servers");
    }

    if (settings.servers) {
        if (!Array.isArray(settings.servers) || !settings.servers.every(isString)) {
            throw Error("servers must be an Array of strings");
        }
        shuffleArray(settings.servers);
    } else if (settings.discoveryUrl) {
        if (!settings.accountId) {
            throw Error("must provide the accountId to use the discovery service");
        }
    }

    settings.versionChangeHandler ||= null;
    settings.version ||= __VERSION_ || 0;
    settings.preventUnload ||= 0; // WAIT_FOR_SEND
    settings.discoveryTTLSeconds ||= 0;
    settings._lastServer ||= 0;
    settings._valid = true;
    return settings as Settings;
}