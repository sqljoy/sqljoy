/**
 * Check if passed object is a SQL object.
 *
 * @param obj to test
 * @returns true if obj is a SQL object
 */
export declare function isSQL(obj: any): obj is SQL;
/**
 * The SQL object represents a SQL query or fragment of a SQL query.
 */
export interface SQL {
    /**
     * A 30 character base64-encoded hash identifying the server function.
     *
     * Set to "invalid" for queries created at runtime (queries not identified by the compiler.)
     */
    query: string;
    /**
     * The text of the query, optional in release builds.
     */
    text?: string;
    /**
     *
     */
    params: Record<string, any>;
    /**
     *
     */
    fragments?: SQL[];
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
export declare function sql(strings: string[], ...exprs: any[]): SQL;
/**
 * __merge provides runtime support for the compiler. It merges one or more query fragments into a parent query
 * at runtime when the compiler cannot determine which fragment will be merged during compilation. It should
 * not be necessary to invoke this manually.
 *
 * @remarks To ensure only whitelisted queries are run, although the merging is dynamic, the entire space
 * of possible queries to merge must have been added to the whitelist at compile time. __merge is just
 * recording which of the predefined combinations of query fragments is actually being used at each
 * invocation. This is enforced by the server when the query is executed.
 *
 * @param query Parent query that uses ${fragment} to include sql fragments
 * @param fragments One or more fragments created with the sql template tag to merge into the parent query
 */
export declare function __merge(query: SQL, ...fragments: SQL[]): SQL;
