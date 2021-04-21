import {taskFailed} from "./actions";
import {REQUEST_ID_MASK, RequestFlags} from "./msgs";
import {Context} from "./context";
import {isString} from "./util";
import {log, LogLevel} from "./log";

interface AnnotatedPromise<T> extends Promise<T> {
	_untrusted_subtask_id: number;
	_untrusted_request_id: number;
}

Object.defineProperty(Promise.prototype, "_untrusted_subtask_id", {
	"value": 0,
	"writable": true,
});

Object.defineProperty(Promise.prototype, "_untrusted_request_id", {
	"value": 0,
	"writable": true,
});

interface Executor {
	resolve: (value: any) => void;
	reject: ((reason?: SubtaskError) => void) | null;
	ctx: Context | null;
}

// At first we tried using a VecWithHoles type data structure here
// where the subtask_id is the index into the array and freed/empty slots
// in the array are re-used with the same subtask_id. However A subtask can be cancelled,
// while fsworker or fsserver still try to queue a resume/reject for it. Because subtask ids
// are re-used, these can end up invoking a different handler than the one originally intended.
// So that strategy turned out to be a bad idea. Now we use a global counter for assigning
// subtask_ids that are never re-used and a hashmap for tracking them.
// We can also get re-used subtask ids if we restart a tenant while there are outstanding subtasks
// and try to pass the result to the new tenant runtime. To reduce the chance of that, we start the
// subtask sequence at a random 31bit value (31 bits so the counter always fits in a u32.)

const SUBTASKS = new Map<number, Executor>();
let SUBTASK_ID_SEQUENCE = Math.random() * 0x7fffffff;

export class SubtaskError extends Error {
	readonly ctx: Context | null;
	readonly data: any;

	constructor(ctx: Context | null, data?: any) {
		super(isString(data) ? data : "subtask error");

		this.ctx = ctx;
		this.data = data;
	}
}

// We have a thorny problem with subtasks.

export function resumeTask(requestId: number, subtaskId: number, data: any) {
	const flags = requestId;
	requestId &= REQUEST_ID_MASK;

	const executor = SUBTASKS.get(subtaskId);
	if (executor === undefined) {
		// This can happen if a timer is deleted or a fetch task is cancelled after queuing a TimerEvent or , it's not necessarily an error
		log(LogLevel.Warn, "resumeTask: no subtask with that id", 0, subtaskId);
		return;
	}

	const ctx = executor.ctx;
	if (ctx != null) {
		if (ctx.id() !== requestId) {
			log(LogLevel.Warn, "resumeTask: requestId doesn't match: " + ctx.id().toString(), requestId, subtaskId);
			return;
		}
	}

	let resolve = executor.resolve;
	let reject = executor.reject;
	try {
		if ((flags & RequestFlags.Resume) !== 0) {
			resolve(data);
		} else if (reject != null) {
			reject(new SubtaskError(ctx, data));
		}
	} catch(e) {
		if (ctx) {
			taskFailed(ctx, e);
		}
	}
	// Only clear the task if it's a promise and not a plain callback
	if (reject != null) {
		clearSubtask(subtaskId);
	}
}

/// cancelRequest cancels all subtask promises outstanding for a request (by rejecting them)
export function cancelRequest(requestId: number) {
	for (let [i, {reject, ctx}] of SUBTASKS) {
		if (reject != null && ctx != null && ctx.id() == requestId) {
			try {
				reject(new SubtaskError(ctx, "request cancelled"));
			} catch(e) {
				log(LogLevel.Error, "promise reject threw: " + (e.message || e.toString()), requestId, i);
			}

			clearSubtask(i);
		}
	}
}

function setSubtask(executor: Executor): number {
	let subtaskId = (SUBTASK_ID_SEQUENCE + 1) & 0x7fffffff;
	SUBTASK_ID_SEQUENCE = subtaskId;
	SUBTASKS.set(subtaskId, executor);
	return subtaskId;
}

export function newPromiseSubtask<T>(ctx: Context): AnnotatedPromise<T> {
	let subtaskId: number = 0;
	const p = new Promise((resolve, reject) => {
		const executor = {resolve, reject, ctx};
		subtaskId = setSubtask(executor as Executor);
	}) as AnnotatedPromise<T>;

	// These are not trusted by the server, as tenant code can modify them
	// We use them for best-effort logging.
	p._untrusted_subtask_id = subtaskId;
	p._untrusted_request_id = ctx.id();
	return p;
}

export function newCallbackSubtask(callback: () => void): number {
	return setSubtask({resolve: callback, reject: null, ctx: null});
}

export function clearSubtask(subtaskId: number) {
	SUBTASKS.delete(subtaskId);
}
