// XXX: This needs to be kept in sync with messages.rs

export enum MsgType {
    CallResult = 144,
    CallError,
    Fetch,
    Log,
    Query = 151,
    CreateTimer,
    DeleteTimer,
}

export enum RequestFlags {
    Resume = 1 << 31,
    Reject = 1 << 30,
}

export const REQUEST_ID_MASK = 0x00ffffff; // reserve upper 8 bits for flags
export const REQUEST_ID_FLAGS_SHIFT = 24;
export const REQUEST_IS_SUBTASK = RequestFlags.Reject | RequestFlags.Resume;
