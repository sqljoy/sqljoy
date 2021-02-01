import {Settings, validateSettings} from "./config.js";
import {SQL, Validator, sqlReplaceNamedParams, sqlValidate} from "./sql.js";
import {Result, ServerEventType} from "./result.js";
import {isString} from "./util.js";

type ServerEventHandler = (res: Result) => void;

enum CommandType {
    SELECT = "S",
    UPDATE = "U",
    INSERT = "I",
    DELETE = "D",
    OTHER = "O",
    CALL = "C",
}

class QueryInProgress {
    resolve: (result: Result) => void;
    reject: (reason: Error) => void;

    constructor(resolve: (result: Result) => void, reject: (reason: Error) => void) {
        this.resolve = resolve;
        this.reject = reject;
    }

    cancel() {
        this.reject(new Error("cancelled"));
    }
}

class FlowState {
    url: string;
    settings: Settings;
    sock: WebSocket | null;
    queries: Record<number, QueryInProgress> = {};
    idSequence: number = 0;
    onPush: ServerEventHandler | null;

    constructor(settings: Settings, onpush: ServerEventHandler | null = null) {
        validateSettings(settings);
        this.url = `wss://${settings.accountId}.flowstate.dev`;
        this.settings = settings;
        this.sock = null;
        this.onPush = onpush;
    }

    async connect() {
        const sock = new WebSocket(this.url);
        sock.onclose = this.onClose.bind(this);
        sock.onerror = this.onError.bind(this);
        sock.onmessage = this.onMsg.bind(this);
        this.sock = sock;
    }

    async ready() {
        if (this.sock === null) {
            console.warn("improve latency by calling connect ahead of using the Flow State connection");
            await this.connect();
        }

        while (this.sock!.readyState === this.sock!.CONNECTING) {
            // User didn't wait for connect() to complete, we support that
            await wait(100);
        }
        if (this.sock!.readyState !== this.sock!.OPEN) {
            throw Error("FlowState connection is closed, create a new instance to issue further queries");
        }
    }

    async executeQuery(query: SQL, params?: Record<string, any>, ...validators: Validator[]): Promise<Result> {
        await this.ready();
        if (params) {
            sqlReplaceNamedParams(query, params);
            if (validators.length !== 0) {
                // This is the client-side validation. We also extract these functions and validParams
                // through the whitelist compiler and save them with the query whitelist so the server
                // can run them again. Note that we can't simply pass that information through from here
                // as the client is untrusted.
                await sqlValidate(query.query, params, validators);
            }
        }
        const [id, msg] = this.queryMsg(query);
        const promise = new Promise<Result>((resolve, reject) => {
            this.queries[id] = new QueryInProgress(resolve, reject);
        });
        this.sock!.send(msg);
        return promise;
    }

    async close() {
        while (this.sock !== null && this.sock.readyState !== this.sock.CLOSED && this.sock.readyState !== this.sock.CLOSING) {
            if (this.sock.bufferedAmount === 0) {
                this.sock.close();
                break;
            } else {
                await wait(100);
            }
        }
    }

    queryMsg(query: SQL): [number, string | ArrayBuffer] {
        // if (DEBUG === undefined) {
        //     // TODO binary protocol
        //     throw Error("not implemented");
        // }

        const id = ++this.idSequence;
        const ty = sqlQueryType(query);
        const msg = {
            ...query,
            id,
            "type": ty,
        };
        return [id, JSON.stringify(msg)];
    }

    onMsg(e: MessageEvent) {
        let id = 0;
        let error = "";
        let result: Result | null = null;

        if (isString(e.data)) {
            const msg = JSON.parse(e.data);
            id = msg.id;
            if (msg.error) {
                error = msg.error;
            } else {
                result = new Result(msg.columns, msg.rows);
            }
        } else {
            // TODO binary protocol
            throw Error("not implemented");
        }

        const promise = this.queries[id];
        if (promise === undefined) {
            if (result !== null && result.eventType !== ServerEventType.INVALID && this.onPush !== null) {
                // This is a server "push" event, call the registered handler
                this.onPush(result);
            }
            return;
        }

        if (error.length !== 0) {
            promise.reject(Error(error));
        } else {
            promise.resolve(result!);
        }
    }

    onError(e: Event) {
        this.close().then(() => undefined);
    }

    onClose(e: CloseEvent) {
        for(let id in this.queries) {
            if (this.queries.hasOwnProperty(id)) {
                this.queries[id].cancel();
            }
        }
        this.queries = {};
        this.sock = null;
    }
}

async function wait(ms: number) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

const RE_FIRST_WORD = /(?:\s*(?:--.*?$|\/*.*?\*\/))*\s*(\w+)/ms;

function sqlQueryType(sql: SQL): CommandType {
    const keyword = RE_FIRST_WORD.exec(sql.query);
    if (keyword === null) {
        throw Error(`invalid query: ${sql.query}`);
    }
    const cmd = (CommandType as Record<string, CommandType>)[keyword[1].toUpperCase()];
    return (cmd !== undefined) ? cmd : CommandType.OTHER;
}