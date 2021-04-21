import {setMaxTimers} from "./timers";
import {setLogLevel} from "./log";

/**
 * These are defined as global variables by the compiler.
 */
declare global {
    const ENV_APP_VERSION: string;
    const ENV_ACCOUNT_ID: string;
}

export function configure(settings: Record<string, any>) {
    if (settings.log_level !== undefined) {
        setLogLevel(settings.log_level);
    }
    if (settings.max_timers !== undefined) {
        setMaxTimers(settings.max_timers);
    }
}