import {outTask} from "./out";
import {MsgType} from "./msgs";
import {isString} from "flowstate/util";

export enum LogLevel {
	Debug,
	Info,
	Warn,
	Error,
}

export let LOG_LEVEL = LogLevel.Error;

export function log(level: LogLevel, argsOrString: any, requestId: number = 0, subtaskId: number = 0) {
	// level is untrusted, ensure it is only an integer and only one of the valid LogLevel values
	level = level | 0; // force to integer
	if (level < LOG_LEVEL) {
		return;
	}
	if (level < LogLevel.Debug || level > LogLevel.Error) {
		throw Error("invalid log level");
	}
	if (Array.isArray(argsOrString) && argsOrString.length === 1) {
		argsOrString = argsOrString[0];
	}
	if (!isString(argsOrString)) {
		argsOrString = JSON.stringify(argsOrString);
	}
	outTask(MsgType.Log + level, requestId, subtaskId, argsOrString, null);
}

export function setLogLevel(level: LogLevel): LogLevel {
	level = level | 0; // force to integer
	if (level < LogLevel.Debug || level > LogLevel.Error) {
		throw Error("invalid log level");
	}
	const prev = LOG_LEVEL;
	LOG_LEVEL = level;
	return prev;
}