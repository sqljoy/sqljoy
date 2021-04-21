import {outTask} from "./out";
import {MsgType} from "./msgs";
import {clearSubtask, newCallbackSubtask} from "./subtasks";

let TIMERS: Set<number> = new Set();
let ACTIVE_TIMERS: number = 0;
let MAX_TIMERS: number = 10;

export function setMaxTimers(limit: number) {
    // Can only change this value if it hasn't been set
    if (MAX_TIMERS === 10) {
        MAX_TIMERS = limit;
    }
}

(globalThis.setTimeout as any) = (callback: (...args: any[]) => void, milliseconds?: number, ...args: any[]): number => {
    if (ACTIVE_TIMERS >= MAX_TIMERS) {
        throw Error("too many timers");
    }

    let subtaskId : number = 0;
    let cb = () => {
        if (!TIMERS.has(subtaskId)) {
            return; // timer has been deleted
        }
        callback(...args);
        clearTimeout(subtaskId);
    }

    ACTIVE_TIMERS++;
    subtaskId = newCallbackSubtask(cb);
    TIMERS.add(subtaskId);
    outTask(MsgType.CreateTimer, 0, subtaskId, milliseconds, null);
    return subtaskId;
};

(globalThis.clearInterval as any) = (globalThis.clearTimeout as any) = (id: number) => {
    if (TIMERS.has(id)) {
        TIMERS.delete(id);
        clearSubtask(id);
    }
};

(globalThis.setInterval as any) = (callback: (...args: any[]) => void, milliseconds: number, ...args: any[]): number => {
    if (ACTIVE_TIMERS >= MAX_TIMERS) {
        throw Error("too many timers");
    }

    let cb = callback;
    if (args.length !== 0) {
        cb = () => callback(...args);
    }

    ACTIVE_TIMERS++;
    const subtaskId = newCallbackSubtask(cb);
    TIMERS.add(subtaskId);
    outTask(MsgType.CreateTimer, 0, subtaskId, -milliseconds, null);
    return subtaskId;
};
