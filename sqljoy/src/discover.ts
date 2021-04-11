import {shuffleArray} from "./util";
import {Settings} from "./config";

export async function getServerUrl(settings: Settings): Promise<string> {
    let servers = settings.servers;
    if (!servers) {
        servers = await maybeRefreshServers(settings);
    }

    if (servers && servers.length !== 0) {
        if (settings._lastServer >= servers.length) {
            settings._lastServer = 0;
            servers = await maybeRefreshServers(settings, true);
        }
        return `wss://${servers[settings._lastServer++]}`;
    }

    if (!settings.accountId) {
        throw Error(`no server found: ${serverCache.error || "unknown error"}`);
    }
    return `wss://${settings.accountId}.sqljoy.com`; // should work even if discovery service is down
}

const serverCache = {
    servers: [] as string[],
    error: "",
    refreshedAt: new Date(2020),
};

async function maybeRefreshServers(settings: Settings, force: boolean = false): Promise<string[]> {
    if (!settings.discoveryUrl) {
        return [];
    }

    const now = new Date();
    if (!force && (now.getTime() - serverCache.refreshedAt.getTime()) < (settings.discoveryTTLSeconds * 1000)) {
        return serverCache.servers;
    }
    return refreshServers(settings, force, now).catch(e => serverCache.error = e.message);
}

export async function refreshServers(settings: Settings, force: boolean = false, refreshedAt: Date = new Date()): Promise<string[]> {
    if (!settings.discoveryUrl) {
        return [];
    }

    const res = await fetch(settings.discoveryUrl);
    if (!res.ok) {
        throw Error(`${res.status} ${res.statusText}`);
    }

    const servers = await res.json();
    shuffleArray(servers);
    serverCache.servers = servers;
    serverCache.refreshedAt = refreshedAt;
    serverCache.error = "";
    return servers;
}