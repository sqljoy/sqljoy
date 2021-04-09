import {isString} from "./util.js";

/**
 * Check if passed object is a SQL object.
 *
 * @param obj to test
 * @returns true if obj is a SQL object
 */
export function isSQL(obj: any): obj is SQL {
    return obj != null && isString(obj.query)
}

/**
 * The SQL object represents a SQL query or fragment of a SQL query.
 */
export interface SQL {
    /**
     * A 30 character base64-encoded hash identifying the server function.
     *
     * Set to "invalid" for queries created at runtime (queries not identified by the compiler.)
     */
    query: string; // base64(sha256(query-obj))[:30] or "invalid"
    /**
     * The text of the query, optional in release builds.
     */
    text?: string; // optional in release builds
    /**
     *
     */
    params: Record<string, any>; // params by "name"
    /**
     *
     */
    fragments?: SQL[];
    /**
     * Idempotent is true if this query can be called multiple times with the same params
     * and produce the same result without side effects. Select queries fit this criteria
     * as can insert queries with an ON CONFLICT clause. Delete queries referencing are
     * the primary key are usually idempotent if the primary key can't be re-used quickly.
     * Update queries that affect a single row are usually idempotent. The compiler only
     * assumes selects are idempotent, anything else must be explicitly marked as such
     * by using the sqli template tag instead of sql on the root query template.
     */
    idempotent?: boolean; // true if it's safe to automatically re-execute this query if the connection drops before receiving a response
}

/**
 * A tagged template literal for SQL queries and fragments of SQL queries.
 *
 * The sqljoy compiler replaces queries with SQL objects in your code, so
 * if this is invoked at runtime it produces an invalid SQL object which
 * will throw an exception if executed or incorporated into other queries.
 *
 * @param strings
 * @param exprs
 */
export function sql(strings: string[], ...exprs: any[]): SQL {
    const parts = [];

    for (let i = 0; ; ) {
        parts.push(strings[i]);
        i++;
        if (i === strings.length) {
            break;
        }
        parts.push(`$${i}`)
    }

    return {
        "query": "invalid",
        "params": {},
    };
}

export const __P = {}; // just a unique marker object

export function __merge(query: SQL, ...fragments: SQL[]) {
    query.fragments = query.fragments || [];
    for (const fragment of fragments) {
        query.fragments.push(fragment);
        if (fragment.params != null) {
            query.params = query.params || {};
            for (const key in fragment.params) {
                if (fragment.params.hasOwnProperty(key)) {
                    query.params[key] = fragment.params[key];
                }
            }
        }
    }
}
