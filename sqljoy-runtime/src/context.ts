import { LOG_LEVEL, LogLevel, log } from "./log";
import {prepareQuery, SQL} from "./sql";
import {Result} from "./result";
import {Validator} from "./validation";
import {outTask} from "./out";
import {MsgType} from "./msgs";
import {newPromiseSubtask} from "./subtasks";

export class Context {
	id: () => number;

	constructor(requestId: number) {
		// We use a closure constructor with a read-only accessor for requestId
		// So that user code can't tamper with it.
		// TODO Alternatively we could use a weak-ref map to Context, test which is faster.
		this.id = () => {
			return requestId;
		};
	}

	detach(): number {
		const requestId = this.id();
		this.id = detached;
		return requestId;
	}

	/**
	 * [[include:executeQuery.md]]
	 *
	 * @param query the compiled SQL query to execute
	 * @param params override bound ${expr} parameters or specify deferred %{name} query parameters
	 * @param validators zero or more validator functions
	 */
	async executeQuery(query: SQL, params?: Record<string, any>, ...validators: Validator[]): Promise<Result> {
		const queryParams = await prepareQuery(query, params, validators, true);

		const promise = newPromiseSubtask<Result>(this);
		outTask(MsgType.Query, this.id(), promise._untrusted_subtask_id, query.query || query.text, queryParams);
		return promise;
	}

	rollback(): Promise<void> {
		const promise = newPromiseSubtask<void>(this);
		outTask(MsgType.Query, this.id(), promise._untrusted_subtask_id, "rollback", null);
		return promise;
	}

	commit(): Promise<void> {
		const promise = newPromiseSubtask<void>(this);
		outTask(MsgType.Query, this.id(), promise._untrusted_subtask_id, "commit", null);
		return promise;
	}

	fetch(request: RequestInfo, init: RequestInit): Promise<Response> {
		// Call the global fetch but add the RequestId header so we can associate this subrequest with the request
		const req_id = this.id().toString();
		if (request instanceof Request) {
			request.headers.append("RequestId", req_id);
		} else {
			if (!init) {
				init = {};
			}
			if (!(init.headers instanceof Headers)) {
				init.headers = new Headers(init.headers);
			}
			init.headers.append("RequestId", req_id);
		}

		return fetch(request, init);
	};

	debug(...args: any[]) {
		if (LOG_LEVEL > LogLevel.Debug) {
			return;
		}

		log(LogLevel.Debug, args, this.id(), undefined);
	};

	info(...args: any[]) {
		if (LOG_LEVEL > LogLevel.Info) {
			return;
		}

		log(LogLevel.Info, args, this.id(), undefined);
	};

	warn(...args: any[]) {
		if (LOG_LEVEL > LogLevel.Warn) {
			return;
		}

		log(LogLevel.Warn, args, this.id(), undefined);
	};

	error(...args: any[]) {
		log(LogLevel.Error, args, this.id(), undefined);
	};
}

function detached(): number {
	return 0;
}