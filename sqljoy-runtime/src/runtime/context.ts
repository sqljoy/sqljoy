import { LOG_LEVEL, LogLevel, log } from "./log";
//import { SQL, Result } from "flowstate";

// TODO
//const COMMIT = sql`commit`;
//const ROLLBACK = sql`rollback`;

export class Context {
	_untrustedSubtaskId: number = 0; // last subtaskId passed to resumeTask (untrusted because it's exposed to client code)
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

	/*
	executeQuery(query: SQL): Promise<Result> {
		// TODO
	};

	rollback(): Promise<void> {
		// TODO
		//outTask(MsgType.Query, this.id(), subtask(), ROLLBACK, null);
	}

	commit(): Promise<void> {
		// TODO
		//outTask(MsgType.Query, this.id(), subtask(), COMMIT, null);
	}

	fetch(request, init): Response {
		// Call the global fetch but add the RequestId header so we can associate this subrequest with the request
		const req_id = this.id().toString();
		if (request instanceof Request) {
			request.headers.append("RequestId", req_id);
		} else {
			if (!init) {
				init = {};
			}
			if (!init.headers) {
				init.headers = new Headers();
			}
			init.headers.append("RequestId", req_id);
		}

		return fetch(request, init);
	};
	*/

	debug(...args: any[]) {
		if (LOG_LEVEL > LogLevel.Debug) {
			return;
		}

		log(LogLevel.Debug, args, this.id(), this._untrustedSubtaskId);
	};

	info(...args: any[]) {
		if (LOG_LEVEL > LogLevel.Info) {
			return;
		}

		log(LogLevel.Info, args, this.id(), this._untrustedSubtaskId);
	};

	warn(...args: any[]) {
		if (LOG_LEVEL > LogLevel.Warn) {
			return;
		}

		log(LogLevel.Warn, args, this.id(), this._untrustedSubtaskId);
	};

	error(...args: any[]) {
		log(LogLevel.Error, args, this.id(), this._untrustedSubtaskId);
	};
}

function detached(): number {
	return 0;
}