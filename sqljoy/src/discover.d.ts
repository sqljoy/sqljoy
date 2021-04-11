import { Settings } from "./config";
export declare function getServerUrl(settings: Settings): Promise<string>;
export declare function refreshServers(settings: Settings, force?: boolean, refreshedAt?: Date): Promise<string[]>;
