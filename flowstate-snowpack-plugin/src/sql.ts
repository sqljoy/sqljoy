import {objectShallowEquals, Location} from "./util.js";

export interface Validator extends Location {
    // TODO
}

export interface SQL extends Location {
    query: string;
    // params maps param name to type (default: string).
    // it includes both bind params %{...} and template variables ${...}
    // Because we don't allow integer keys, this is also an ordered collection
    // where $n maps to Object.keys(params)[n-1]. This is true even when merging queries
    // as we renumber the parameters in the query being inserted, and all its keys are added
    // in the same order, so the merged keys are: Object.keys(parent).concat(Object.keys(insert))
    paramCount: number;
    params: Record<string, string | string[] | SQL[] | Record<string, string | SQL>>;
    validators: Record<string, Validator>;
    referenced: Location[];
}

const RE_QUERY_VARS = /\$(\d+?)/g;
const RE_PARAMS = /[%$]{([^:]+?)(?::\${([^}]+?)})?}/g;
const RE_INVALID_KEY = /^\d*$/; // empty string or positive integer keys are invalid

export function renumberVars(query: string, numPrevParams: number): string {
    if (numPrevParams === 0) {
        return query;
    }

    return query.replace(RE_QUERY_VARS, (_, num: string) =>
        `$${parseInt(num) + numPrevParams}`
    );
}

export function SQLFromQuery(query: string, paramCount: number = 0, params?: Record<string, string>): SQL {
    return {query, fileName: "", line: 0, paramCount, params: params || {}, validators: {}, referenced: []};
}

export function replaceParams(sql: SQL): void {
    sql.query = sql.query.replace(RE_PARAMS, (_: string, key: string, ty?: string) => {
        if (key.startsWith("SESSION.")) {
            key = key.substr(8);
            ty = "session";
        } else if (key.startsWith("ENV.")) {
            key = key.substr(4);
            ty = "env";
        }

        if (!ty) {
            ty = "string";
        }
        assertValidKey(key);
        const existing = sql.params[key];
        if (existing === undefined) {
            sql.params[key] = ty;
        } else if (existing !== ty) {
            throw Error(`incompatible types ${existing} and ${ty} for query parameter ${key}`);
        }
        return `$${++sql.paramCount}`;
    });
}

function assertValidKey(key: string): void {
    if (RE_INVALID_KEY.test(key)) {
        throw Error("integer named parameters are not permitted");
    }
}

export function isPublicQuery(sql: SQL): boolean {
    if (sql.paramCount === 0) {
        return true;
    }
    for (let key in sql.params) {
        if (sql.params.hasOwnProperty(key)) {
            if (sql.params[key] === "session") {
                return false;
            }
        }
    }
    return true;
}

export function mergeQueries(keep: SQL, merge: SQL) {
    keep.referenced = keep.referenced.concat(merge.referenced);
    if (!objectShallowEquals(keep.validators, merge.validators)) {
        throw Error("set of validator functions differs between invocations of query");
    }
}
