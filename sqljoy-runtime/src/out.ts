import {MsgType, REQUEST_ID_FLAGS_SHIFT, REQUEST_ID_MASK} from "./msgs";

export type OutTask = [number | null, number | null, any, any];

let OUTBOX : OutTask[] = [];
let OUTBOX_TAIL = 0;

export function setOutbox(outbox: OutTask[], length: number) {
	OUTBOX_TAIL = length;
	OUTBOX = outbox;
}

export function getOutboxLength(): number {
	return OUTBOX_TAIL;
}

export function outTask(
	msgType: MsgType,
	requestId: number,
	subtaskId: number,
	arg1: any,
	arg2: any)
{
	if (msgType < 0 || msgType > 255) {
		throw Error("msgType is out of range");
	}
	requestId &= REQUEST_ID_MASK;
	requestId |= (msgType << REQUEST_ID_FLAGS_SHIFT);
	if (OUTBOX_TAIL >= OUTBOX.length) {
		OUTBOX_TAIL = OUTBOX.push([requestId, subtaskId, arg1, arg2]);
	} else {
		const out = OUTBOX[OUTBOX_TAIL];
		if (out == null) {
			throw Error("out is not defined!");
		}
		out[0] = requestId;
		out[1] = subtaskId;
		out[2] = arg1;
		out[3] = arg2;
		OUTBOX_TAIL++;
	}
}