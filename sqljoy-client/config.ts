import {isString, isPromise, shuffleArray} from "./util.js";

export enum PreventUnload {
    WAIT_FOR_SEND,
    WAIT_FOR_ACKNOWLEDGEMENT,
    NEVER
}

/**
 * Settings object to configure the SQLJoy client.
 */
export interface Settings {
    accountId?: string; // should be omitted if self-hosted
    discoveryUrl?: string;
    discoveryTTLSeconds?: number;
    servers: string[];
    preventUnload: PreventUnload;
    _valid?: boolean;
    _lastServer?: number;
}

export function validateSettings(settings: Partial<Settings>) {
    if (settings._valid) {
        return;
    }

    if (!settings.discoveryUrl && !settings.servers) {
        throw Error("must provide either a discovery service or a list of servers");
    }

    if (settings.servers) {
        if (!Array.isArray(settings.servers) || !settings.servers.every(isString)) {
            throw Error("servers must be an Array of strings");
        }
        shuffleArray(settings.servers);
    }

    settings.preventUnload |= 0; // WAIT_FOR_SEND
    settings.discoveryTTLSeconds |= 0;
    settings._lastServer |= 0;
    settings._valid = true;
}

export async function getServerUrl(settings: Settings): Promise<string> {
    let servers = settings.servers;
    if (!servers) {
        servers = await refreshServers(settings);
    }

    if (servers && servers.length !== 0) {
        if (settings._lastServer >= servers.length) {
            settings._lastServer = 0;
            servers = await refreshServers(settings, true);
        }
        return `wss://${servers[settings._lastServer++]}`;
    }

    if (!settings.accountId) {
        throw Error(`no server found: ${serverCache.error || "unknown error"}`);
    }
    return `wss://${settings.accountId}.sqljoy.com`; // should work even if discovery service is down
}

const serverCache = {
    servers: [],
    error: "",
    fetchedAt: new Date(2020),
};

export async function refreshServers(settings: Settings, force: boolean = false): Promise<string[]> {
    if (!settings.discoveryUrl) {
        return [];
    }

    const now = new Date();
    if (!force && now - serverCache.fetchedAt < settings.discoveryTTLSeconds * 1000) {
        return serverCache.servers;
    }

    const res = await fetch(settings.discoveryUrl);
    if (!res.ok) {
        serverCache.error = `${res.status} ${res.statusText}`;
        return [];
    }

    const servers = res.json();
    if (!Array.isArray(servers) || servers.length === 0) {
        return [];
    }

    shuffleArray(servers);

    serverCache.servers = servers;
    serverCache.fetchedAt = now;
    serverCache.error = "";
}