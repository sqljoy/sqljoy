import {Settings, WaitBehavior} from "./config";

declare class SQLJoy {
    constructor(settings: Partial<Settings>)
    drain(): void
    hasPending(waitFor?: WaitBehavior): boolean
}

/**
 * The default OnVersionChange handler. Calls `location.replace(location.href)`.
 *
 * Waits for Promise.all(getAllClients().map(c => c.drain())) for pending queries/calls
 * to complete and then runs `location.replace(location.href)` to reload the page, bypassing the cache.
 *
 * @remarks This mechanism can be used to update distributed clients on each deploy,
 * reducing the chance that a version mismatch causes unexpected behavior or bugs.
 *
 * @see {@link Settings.versionChangeHandler} for more information.
 *
 * @param client_version
 * @param server_version
 */
export function defaultVersionChangeHandler(client_version: number, server_version: number) {
    Promise.all(getAllClients().map(c => c.drain())).then(() => {
        location.replace(location.href);
    });
}

const allClients: SQLJoy[] = [];

/**
 * Get all SQLJoy client objects which have not been closed.
 *
 * @remarks This is for advanced usage.
 *
 * @see {@link getClient} should be preferred.
 *
 * @category Advanced
 */
export function getAllClients(): SQLJoy[] {
    return allClients;
}

/**
 * getClient is the preferred way to create/access a SQLJoy client object. It creates or
 * returns a singleton client object.
 *
 * @remarks If close() is called on the client, a subsequent call to getClient returns a new
 * SQLJoy client instance.
 *
 * @param settings - client configuration and options (ignored if not creating a client for the first time)
 */
export function getClient(settings: Partial<Settings>): SQLJoy {
    let client = allClients[0];
    if (client === undefined) {
        client = new SQLJoy(settings);
    }
    return client;
}

export function addClient(client: SQLJoy) {
    allClients.push(client);
}

export function removeClient(client: SQLJoy) {
    const i = allClients.indexOf(client);
    if (i >= 0) {
        allClients.splice(i, 1);
    }
}