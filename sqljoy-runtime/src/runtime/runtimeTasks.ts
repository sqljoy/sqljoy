import {taskFailed} from "./actions";
import {REQUEST_ID_MASK, RequestFlags} from "./msgs";
import {Context} from "./context";
import {isString} from "flowstate/util";
import {log, LogLevel} from "./log";
import {exec} from "child_process";

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

export type TaskData = { [prop: string]: any } | string | ArrayBuffer | null | undefined;

type Executor = [(value: TaskData) => void, ((reason?: SubtaskError) => void) | null, Context | null];

// At first we tried using a VecWithHoles type data structure here
// where the subtask_id is the index into the array and freed/empty slots
// in the array are re-used with the same subtask_id. However A subtask can be cancelled,
// while fsworker or fsserver still try to queue a resume/reject for it. Because subtask ids
// are re-used, these can end up invoking a different handler than the one originally intended.
// So that strategy turned out to be a bad idea. Now we use a global counter for assigning
// subtask_ids that are never re-used and a hashmap for tracking them.
// We can also get re-used subtask ids if we restart a tenant while there are outstanding subtasks
// and try to pass the result to the new tenant runtime. To reduce the chance of that, we start the
// subtask sequence at a random 31bit value.

const SUBTASKS = new Map<number, Executor>();
let SUBTASK_ID_SEQUENCE = Math.random() * 0x7fffffff;

export class SubtaskError extends Error {
	readonly ctx: Context | null;
	readonly data: TaskData;

	constructor(ctx: Context | null, data?: any) {
		super(isString(data) ? data : "subtask error");

		this.ctx = ctx;
		this.data = data;
	}
}

// We have a thorny problem with subtasks.

export function resumeTask(requestId: number, subtaskId: number, data: TaskData) {
	const flags = requestId;
	requestId &= REQUEST_ID_MASK;

	const executor = SUBTASKS.get(subtaskId);
	if (executor === undefined) {
		// This can happen if a timer is deleted or a fetch task is cancelled after queuing a TimerEvent or , it's not necessarily an error
		log(LogLevel.Warn, "resumeTask: no subtask with that id", 0, subtaskId);
		return;
	}

	const ctx = executor[2];
	if (ctx != null) {
		if (ctx.id() !== requestId) {
			log(LogLevel.Warn, "resumeTask: requestId doesn't match: " + ctx.id().toString(), requestId, subtaskId);
			return;
		}
		ctx._untrustedSubtaskId = subtaskId;
	}

	let resolve = executor[0];
	let reject = executor[1];
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
	for (let [i, executor] of SUBTASKS) {
		const reject = executor[1];
		const ctx = executor[2];
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
	const executor: any[] = [null, null, null];
	const p = new Promise((resolve, reject) => {
		executor[0] = resolve;
		executor[1] = reject;
		executor[2] = ctx;
	}) as AnnotatedPromise<T>;

	const subtaskId = setSubtask(executor as Executor);

	// These are not trusted by the server, as tenant code can modify them
	// We use them for best-effort logging.
	p._untrusted_subtask_id = subtaskId;
	p._untrusted_request_id = ctx.id();
	return p;
}

export function newCallbackSubtask(callback: () => void): number {
	const executor = [callback, null, null];
	return setSubtask(executor as Executor);
}

export function clearSubtask(subtaskId: number) {
	SUBTASKS.delete(subtaskId);
}
