import {ValidationErrors, hasErrors} from "./errors.js";
import {isPromise, isString, endsWith} from "./util.js";

function isSQL(obj: any): obj is SQL {
    return obj.query !== undefined && obj.params !== undefined;
}

function isUnionFragment(obj: any): obj is UnionFragment {
    return obj.type === "union";
}

function isSQLFragment(obj: any): obj is SQLFragment {
    return obj.type === "sql";
}

function isFragment(obj: any): obj is BaseFragment {
    return isSQLFragment(obj) || isUnionFragment(obj);
}

export interface SQL {
    query: string;
    params: any[];
}

enum FragmentType {
    SQL = "sql",
    UNION = "union",
}

interface BaseFragment {
    type: FragmentType;
    sql: any;
    prefix: string | null;
    params: Record<string, any>; // select columns or fragments from
    join?: string | null;
    default?: string | null;
}

interface UnionFragment extends BaseFragment {
    type: FragmentType.UNION;
    sql: Record<string, string | SQL>;
}

interface SQLFragment extends BaseFragment {
    type: FragmentType.SQL;
    columns: Record<string, any>; // whitelist of allowed columns
    sql: string;
}

export type Validator = (errors: ValidationErrors, params: Record<string, any>, query?: string) => Promise<void> | void;

class SQLBuilder {
    parts: string[];
    params: any[];

    constructor() {
        this.parts = [];
        this.params = [];
    }

    fromTemplate(strings: string[], ...exprs: any[]) {
        this.parts.push(strings[0]);

        for (let i=0; i < exprs.length; ) {
            const param = exprs[i++];
            if (isSQL(param)) {
                this.appendSQL(param);
            } else if (isFragment(param)) {
                this.appendFragment(param);
            } else {
                this.parts.push(` ${this.addParam(param)} ${strings[i]}`);
            }
        }
    }

    appendSQL(sql: SQL) {
        // Merge the SQL literal in param into this one.
        // Append params.length to the query vars ($0, $1, etc.)
        this.parts.push(renumberVars(sql.query, this.params.length));
        // Extend params with param.params
        for (let p of sql.params) {
            this.params.push(p);
        }
    }

    appendFragment(frag: BaseFragment) {
        let prefix = "";
        if (frag.prefix) {
            prefix = frag.prefix;
            if (prefix[prefix.length-1] !== " ") {
                prefix += " ";
            }
        }
        this.parts.push(prefix);

        // Temporarily replace this.parts as these clauses will need to be combined with frag.join
        let parts = this.parts;
        this.parts = [];
        if (isSQLFragment(frag)) {
            for (let key in frag.params) {
                let alias = frag.columns[key];
                if (alias !== undefined) {
                    if (!isString(alias)) {
                        alias = key;
                    }
                    let vars: Record<string, string> = {"col": alias};
                    if (frag.sql.indexOf("%{val}") >= 0) {
                        vars["val"] = this.addParam(frag.params[key]);
                    }
                    const clause = replaceNamedVars(frag.sql, vars);
                    this.parts.push(clause);
                }
            }
        } else if (isUnionFragment(frag)) {
            for (let key in frag.params) {
                let sql = frag.sql[key];
                if (sql !== undefined) {
                    if (isString(sql)) {
                        sql = {"query": sql, "params": []};
                    }
                    sql.query = replaceNamedVarsWithParams(sql.query, sql.params, frag.params);
                    this.appendSQL(sql);
                }
            }
        }
        [parts, this.parts] = [this.parts, parts]; // swap them back

        if (parts.length === 0) {
            if (frag.default) {
                this.parts.push(frag.default);
            }
        } else if (parts.length === 1) {
            this.parts.push(parts[0]);
        } else {
            this.parts.push(parts.join(frag.join ? ` ${frag.join} ` : " "));
        }
    }

    addParam(param: any): string {
        return `$${this.params.push(param)}`;
    }

    toSQL(): SQL {
        const sql: SQL = {
            "query": this.parts.join(),
            "params": this.params,
        };
        return sql;
    }
}

export function sql(strings: string[], ...exprs: any[]): SQL {
    if (exprs.length === 0) {
        const query = strings[0];
        return {
            query, params: exprs
        };
    }

    const builder = new SQLBuilder();
    builder.fromTemplate(strings, exprs);
    return builder.toSQL();
}

export function sqlReplaceNamedParams(sql: SQL, params: Record<string, any>) {
    sql.query = replaceNamedVarsWithParams(sql.query, sql.params, params);
}

export async function sqlValidate(query: string, params: Record<string, any>, validators: Validator[]): Promise<void> {
    const errors: ValidationErrors = {};
    const promises: Promise<void>[] = [];
    for (let validator of validators) {
        const result = validator(errors, params, query);
        if (isPromise(result)) {
            promises.push(result);
        }
    }
    if (promises.length !== 0) {
        await Promise.all(promises);
    }
    if (hasErrors(errors)) {
        throw errors;
    }
}

const RE_QUERY_VARS = /\$(\d+?)/g;
const RE_NAMED_VARS = /%{([^}]+?)}/g;
const RE_INVALID_KEY = /^\d*$/; // empty string or positive integer keys are invalid

function renumberVars(query: string, numPrevParams: number): string {
    if (numPrevParams === 0) {
        return query;
    }

    return query.replace(RE_QUERY_VARS, (_, num: string) =>
        `$${parseInt(num) + numPrevParams}`
    );
}

function replaceNamedVars(s: string, vars: Record<string, string>): string {
    return s.replace(RE_NAMED_VARS, (_: string, name: string) => {
        const [key, ty] = name.split(":", 2);
        assertValidKey(key);
        const val = convertType(vars[key], ty);
        if (val === undefined) {
            throw Error(`missing value for ${name}`);
        }
        return val;
    });
}

function replaceNamedVarsWithParams(query: string, params: any[], vars: Record<string, any>): string {
    return query.replace(RE_NAMED_VARS, (_: string, name: string) => {
        const [key, ty] = name.split(":", 2);
        assertValidKey(key);
        const val = convertType(vars[key], ty);
        if (val === undefined) {
            throw Error(`missing value for ${name}`);
        }
        return `$${params.push(val)}`;
    });
}

function assertValidKey(key: string): void {
    if (RE_INVALID_KEY.test(key)) {
        throw Error("integer named parameters are not permitted");
    }
}

function convertType(val: any, ty: string = "string"): any {
    // Handle the simple case
    if (ty === "session" || typeof val === ty) {
        return val;
    }

    if (ty === "string") {
        return val.toString();
    } else if (ty === "int") {
        const num = parseInt(val);
        if (isNaN(num)) {
            throw Error(`Expected an int, not: ${val}`);
        }
        return num;
    } if (ty === "number") {
        const num = parseFloat(val);
        if (isNaN(num)) {
            throw Error(`Expected a number, not: ${val}`);
        }
        return num;
    } else if (ty === "boolean") {
        if (isString(val)) {
            const lower = val.toLowerCase();
            if (lower === "true") {
                return true;
            } else if (lower === "false") {
                return false;
            }
        } else if (val === 0) {
            return false;
        } else if (val === 1) {
            return true;
        }
        throw Error(`Expected a bool, not: ${val}`);
    } else if (Array.isArray(val) && endsWith(ty, "[]")) {
        ty = ty.substr(0, ty.length - 2);
        return val.map(v => convertType(v, ty));
    }
    throw Error(`Unsupported type for query param: ${val}`);
}