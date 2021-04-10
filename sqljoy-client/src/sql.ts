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
 * If this is invoked at runtime it produces an invalid SQL object which
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

/**
 * @internal
 * __merge provides runtime support for the compiler. It merges one or more query fragments into a parent query
 * at runtime when the compiler cannot determine which fragment will be merged during compilation. It should
 * not be necessary to invoke this manually.
 *
 * To ensure only whitelisted queries are run, although the merging is dynamic, the entire space
 * of possible queries to merge must have been added to the whitelist at compile time. __merge is just
 * recording which of the predefined combinations of query fragments is actually being used at each
 * invocation. This is enforced by the server when the query is executed.
 *
 * @param query Parent query that uses ${fragment} to include sql fragments
 * @param fragments One or more fragments created with the sql template tag to merge into the parent query
 *
 * @category Advanced
 */
export function __merge(query: SQL, ...fragments: SQL[]): SQL {
    // make a shallow copy of the query so we don't modify the original
    query = { ...query };
    query.fragments = query.fragments ? query.fragments.slice() : [];
    for (const fragment of fragments) {
        query.fragments.push(fragment);
        if (fragment.params != null) {
            query.params = { ...query.params };
            for (const key in fragment.params) {
                if (fragment.params.hasOwnProperty(key)) {
                    query.params[key] = fragment.params[key];
                }
            }
        }
    }
    return query;
}
