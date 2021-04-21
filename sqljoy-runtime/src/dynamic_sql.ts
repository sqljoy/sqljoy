import {SQL, isSQL, mergeParams} from "./sql";
import {isString} from "./util";

function isDynamicSQL(obj: any): boolean {
    return isSQL(obj) && !obj.query;
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
 * Unlike on the client, this is also a function that converts an arbitrary string to
 * a SQL query or fragment. This facilitates creating dynamic queries more easily.
 *
 * @example
 * ```const direction = sql((order > 0) ? "ASC" : "DESC");
 * const query = sql`SELECT * FROM users ORDER BY id ${direction}`;```
 *
 * @remarks Use this with care, do not have any user input in the passed string or you introduce
 * vulnerabilities to SQL injection attacks!
 *
 * @param noescape
 */
(globalThis as any).sql = function(noescape: string): SQL {
    if (isString(noescape)) {
        // Return an unescaped SQL query or fragment
        return {
            query: "",
            text: noescape,
            params: [],
        }
    }

    throw Error("query was not compiled, see compiler output");
}

const mergeCompiled = sql.merge;

/**
 * @internal
 * merge provides runtime support for the compiler. It merges one or more query fragments into a parent query
 * at runtime when the compiler cannot determine which fragment will be merged during compilation. It should
 * not be necessary to invoke this manually.
 *
 * Unlike in the client library, this server runtime version of merge allows constructing
 * dynamic SQL queries that are not in the query whitelist. Like with any backend framework,
 * it's up to the developer to make sure the query doesn't grant permissions to view or alter
 * data that the user shouldn't have access to. A dynamic query has the query attribute set
 * to "" and the query SQL is stored in the text attribute.
 *
 * @param query Parent query that includes other SQL queries or fragments with ${fragment}
 * @param fragments One or more fragments created with the sql template tag or function to merge into the parent query
 */
sql.merge = function(query: SQL, ...fragments: SQL[]): SQL {
    query = mergeCompiled(query, ...fragments);
    if (isDynamicSQL(query) || fragments.some(q => isDynamicSQL(q))) {
        // If any fragment is dynamic, the whole query will be dynamic
        query = replaceFragments(query, fragments);
    }
    return query;
}

/**
 * Replaces fragments into the query text and erases the query hash (making the resulting query a dynamic query.)
 * @param query to flatten
 */
function replaceFragments(query: SQL, fragments: SQL[]): SQL {
    if (query.fragments !== undefined) {
        fragments = query.fragments.concat(fragments);
    }

    let {text, params} = query;
    let i = 0;
    text = text!.replace(/%{}/g, () => {
        if (i >= fragments.length) {
            throw Error("there are more query fragment placeholders '%{}' than there are fragments");
        }
        params = mergeParams(params, fragments[i].params);
        return fragments[i++].text!;
    });
    if (i !== fragments.length) {
        throw Error("there are more query fragments than fragment placeholders '%{}'");
    }

    text = renumberVars(text);
    return {
        query: "", // mark this as a dynamic query by clearing the hash
        text,
        params,
    };
}

function renumberVars(query: string): string {
    let i = 1;
    return query.replace(/\$(\d+?)/g, () => `$${i++}`);
}