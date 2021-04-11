// For security reasons the runtime has to be imported before user code in userTasks
// We edit the builtins/globals.
import {
	getOutboxLength,
	log,
	LogLevel,
	OutTask,
	seedRandom,
	setDate,
	setOutbox,
	taskFailed,
	taskResult,
	VarLen
} from "./runtime/index";
// @ts-ignore
import * as userTasks from "./userTasks";
import {cancelRequest, resumeTask, TaskData} from "./runtime/runtimeTasks";
import {REQUEST_IS_SUBTASK} from "./runtime/msgs";
import {Context} from "./runtime/context";
import {isString} from "flowstate/util";
import {configure} from "./runtime/config";

type InTask = [number | null, VarLen, TaskData];

const BUILTINS: Record<string, any> = {
	"__configure": configure,
	"__cancel": cancelRequest,
};

export function runTasks(tasks: InTask[], results: OutTask[], tasks_length: number, results_length: number, now: number): number {
	setOutbox(results, results_length);
	setDate(now);
	seedRandom(now);
	for (let i=0; i < tasks_length; i++) {
		let task = tasks[i];

		if (!task) {
			throw Error([task, tasks.length, i, tasks_length].toString());
		}

		let requestId = task[0];
		if (requestId == null) {
			continue;
		}

		if ((requestId & REQUEST_IS_SUBTASK) !== 0) {
			const subtaskId = task[1];
			if (typeof subtaskId !== "number") {
				log(LogLevel.Error, "runTasks: expected numeric subtaskId", requestId, 0);
				continue;
			}
			resumeTask(requestId, subtaskId, task[2]);
		} else {
			const arg1 = task[1];
			if (!isString(arg1)) {
				log(LogLevel.Error, "runTasks: expected string function name as arg1 to runTask", requestId, 0);
				continue;
			}
			runTask(requestId, arg1, task[2]);
		}

		// Cleanup task values so they can be garbage collected once no longer referenced
		task[0] = null;
		task[1] = null;
		task[2] = null;
	}
	return getOutboxLength();
}

function runTask(requestId: number, name: string, arg: TaskData) {
	const taskFunction = isString(name) ? (userTasks as any)[name] || BUILTINS[name] : undefined;
	const ctx = new Context(requestId);
	if (taskFunction === undefined) {
		taskFailed(ctx, new Error(`task not found: ${name}`));
		return;
	}

	let maybePromise;
	try {
		maybePromise = taskFunction.call(ctx, arg);
	} catch(e) {
		taskFailed(ctx, e);
		return;
	}
	if (maybePromise != null && maybePromise.then !== undefined) {
		maybePromise.then((r: any) => {
			taskResult(ctx, r);
		});
		if (maybePromise.catch !== undefined) {
			maybePromise.catch((e: Error) => {
				taskFailed(ctx, e);
			});
		}
	} else {
		taskResult(ctx, maybePromise);
	}
}