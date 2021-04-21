import {isString, shuffleArray} from "./util.js";
import {isRowsResult, ResultRows} from "./result";

export const versionMajor = 0;
export const versionMinor = 10;

/**
 * These are defined as global variables by the compiler.
 */
declare global {
    const ENV_APP_VERSION: string;
    const ENV_ACCOUNT_ID: string;
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

type JSONReviver = (this: any, key: string, value: any) => any;

/**
 * OnVersionChange is the type of the callback function used to
 * customize behavior when the deployed server version is different
 * to the current client version. The server pushes a notification
 * to connected clients with differing versions when a deploy occurs.
 */
export type OnVersionChange = (client_version: string, server_version: string) => void;

/**
 * Settings object to configure the SQLJoy client.
 */
export interface Settings {
    /**
     * The registered account id with SQLJoy. Required for managed cloud service and server discovery.
     *
     * @defaultValue window.ENV_ACCOUNT_ID, set in a global by the compiler
     *
     * @remarks It's free to create an account, no credit card required.
     */
    accountId?: string;
    /**
     * The version of the compiled application, stored in global ENV_APP_VERSION by the compiler.
     * If this doesn't match the ENV_APP_VERSION on the server, the versionChangeHandler will be invoked.
     *
     * @defaultValue window.ENV_APP_VERSION || "" (disabled)
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
export function validateSettings(settings: Partial<Settings>): Settings {
    if (!settings) {
        throw Error("settings cannot be omitted");
    }
    if (settings._valid) {
        return settings as Settings;
    }
    settings.accountId ||= ENV_ACCOUNT_ID;

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

    settings.jsonReviver = makeJSONReviver(settings.jsonReviver);
    settings.versionChangeHandler ||= null;
    settings.version ||= ENV_APP_VERSION || "";
    settings.preventUnload ||= 0; // WAIT_FOR_SEND
    settings.discoveryTTLSeconds ||= 0;
    settings._lastServer ||= 0;
    settings._valid = true;
    return settings as Settings;
}

function makeJSONReviver(jsonReviver?: JSONReviver): JSONReviver {
    return function(this: any, key: string, value: any): any {
        if (isRowsResult(value)) {
            const {__C_, __R_, __A_} = value;
            return new ResultRows(__C_, __R_, __A_);
        }
        if (jsonReviver !== undefined) {
            return jsonReviver.call(this, key, value);
        }
        return value;
    };
}