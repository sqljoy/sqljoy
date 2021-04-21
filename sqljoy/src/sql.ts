import {isString} from "./util.js";
import {validate, ValidationError, Validator} from "./validation";

interface SQLFunc {
    (strings: string[] | string, ...exprs: any[]): SQL;
    (noescape: string): SQL;
    merge: (query: SQL, ...fragments: SQL[]) => SQL;
}

declare global {
    let sql: SQLFunc;
}

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
 *
 * @see {@link sql} for how to create this.
 */
export interface SQL {
    /**
     * A 30 character base64-encoded hash identifying the server function.
     *
     * Set to "" for queries created at runtime (not allowed on the client.)
     */
    query: string; // base64(sha256(query-obj))[:30] or "invalid"
    /**
     * The text of the query, optional on the client.
     */
    text?: string; // optional in release builds
    /**
     * Query parameters included via ${expr}:name or %{deferred-param}.
     *
     * These can be overridden (must be for deferred params with % syntax)
     * through the param argument to executeQuery.
     *
     * We don't do string substitution, the database handles substitution
     * of the parameters to prevent possible SQL injection attacks.
     *
     * @see {@link executeQuery} for more info.
     */
    params: Record<string, any>;
    /**
     * fragments are SQL fragments that have been including in this query
     * via ${fragment}. On the client it is necessary that the compiler is
     * able to determine all the possible fragments that can be substituted.
     */
    fragments?: SQL[];
}

/**
 * A tagged template literal for SQL queries and fragments of SQL queries.
 *
 * You must use sql to mark string literals containing SQL. Anything else
 * included in a query is escaped.
 *
 * @example Basic query
 * ```const query = sql`SELECT * FROM users WHERE id = ${user_id}`;```
 * @example Is compiled to:
 * `const query = {..., "text": "SELECT * FROM users WHERE id = $1", "params": {$1: user_id}}`
 *
 * Notice how the template expressions are replaced with placeholders and
 * will be properly escaped. This is not a risk for SQL injection, on the contrary,
 * it makes it much harder to construct a query vulnerable to SQL injection attacks.
 *
 * @remarks The compiler detects all queries constructed with this template tag and replaces
 * them with query objects. It's an error to write a query that's not compiled.
 * If this is invoked at runtime it throws an Error.
 *
 * @global This is defined as global variable so you do not have to import it to use it.
 * It is the only global variable defined by sqljoy.
 *
 * @param strings
 * @param exprs
 */
export function sql(strings: string[], ...exprs: any[]): SQL {
    throw Error("query was not compiled, see compiler output");
}

// Make it global
(globalThis as any).sql = sql;

/**
 * @internal
 * merge provides runtime support for the compiler. It merges one or more query fragments into a parent query
 * at runtime when the compiler cannot determine which fragment will be merged during compilation. It should
 * not be necessary to invoke this manually.
 *
 * To ensure only whitelisted queries are run, although the merging is dynamic, the entire space
 * of possible queries to merge must have been added to the whitelist at compile time. merge is just
 * recording which of the predefined combinations of query fragments is actually being used at each
 * invocation. This is enforced by the server when the query is executed.
 *
 * If a parameter name in a fragment conflicts with a name in the query or an earlier fragment
 * we make it unique by appending a integer to the end, starting at 2 and printing a warning
 * to the console.
 *
 * @param query Parent query that uses ${fragment} to include sql fragments
 * @param fragments One or more fragments created with the sql template tag to merge into the parent query
 *
 * @category Advanced
 */
(sql as any).merge = function(query: SQL, ...fragments: SQL[]): SQL {
    // Make a shallow copy of the query so we don't modify the original
    query = { ...query };
    query.fragments = query.fragments ? query.fragments.slice() : [];
    for (const fragment of fragments) {
        query.fragments.push(fragment);
        query.params = mergeParams(query.params, fragment.params);
    }
    return query;
}

export function mergeParams(params: Record<string, any>, other: Record<string, any>): Record<string, any> {
    let dest: Record<string, any> | null = null;
    for (let key in other) {
        if (!other.hasOwnProperty(key)) {
            continue;
        }
        if (dest === null) {
            // Make a shallow copy of the query so we don't modify the original
            dest = { ...params };
        }
        const val = other[key];
        if (params.hasOwnProperty(key)) {
            // There's a param name conflict.
            let m = key.match(/(.+?)\d+$/);
            let baseKey = (m === null) ? key : m[1];
            let i = 2;
            // Add a number to the end until it's unique.
            do {
                key = `${baseKey}${i++}`;
            } while(!params.hasOwnProperty(key));

            console.warn("param name conflict in query, renamed %s -> %s", baseKey, key);
        }
        params[key] = val;
    }
    return dest || params;
}

interface QueryParams {
    params: Record<string, any>;
    fragments: string[];
}

export async function prepareQuery(query: SQL, addParams: Record<string, any> | undefined, validators: Validator[], isServer: boolean): Promise<QueryParams> {
    if (query.query === "invalid") {
        throw Error(`attempt to execute uncompiled query, refer to the compiler warning for more info: ${query.text || query.query}`);
    }

    // Let it throw the ValidationError
    let params = await validate(query, addParams, validators);

    if (!isServer) {
        // This is the client-side validation. The server will run the validation again.
        // So send the server the unmodified original parameters.
        params = params ? Object.assign({}, query.params, addParams) : query.params;
    }

    const fragments: string[] = [];
    for (let fragment of query.fragments || fragments as any) {
        fragments.push(fragment.query);
    }

    return {
        params,
        fragments
    };
}
