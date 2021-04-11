import {setMaxTimers} from "./timers";
import {setLogLevel} from "./log";

export function configure(settings: Record<string, any>) {
    if (settings.log_level !== undefined) {
        setLogLevel(settings.log_level);
    }
    if (settings.log_level !== undefined) {
        setMaxTimers(settings.max_timers);
    }
}