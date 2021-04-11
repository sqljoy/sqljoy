import {outTask} from "./out";
import {MsgType} from "./msgs";
import {Context} from "./context";

export function taskResult(ctx: Context, result: any) {
	outTask(MsgType.CallResult, ctx.id(), 0, JSON.stringify(result), null);
}

export function taskFailed(ctx: Context, error: Error) {
	if (error.message && error.name) {
		error.message = error.name + ": " + error.message;
	} else if (error.name) {
		error.message = error.name;
	} else {
		error = new Error("invalid error type passed to taskFailed: " + typeof error);
	}
	outTask(MsgType.CallError, ctx.detach(), 0, error, null);
}