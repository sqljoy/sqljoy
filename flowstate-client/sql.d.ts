import { ValidationErrors } from "./errors";
export interface SQL {
    query: string;
    params: any[];
}
export declare type Validator = (errors: ValidationErrors, params: Record<string, any>, query?: string) => Promise<void> | void;
export declare function sql(strings: string[], ...exprs: any[]): SQL;
export declare function sqlReplaceNamedParams(sql: SQL, params: Record<string, any>): void;
export declare function sqlValidate(query: string, params: Record<string, any>, validators: Validator[]): Promise<void>;
