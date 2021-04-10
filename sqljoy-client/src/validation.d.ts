import { SQL } from "./sql";
export declare type Validator = (errors: ValidationErrors, params: Record<string, any>) => Promise<void> | void;
export declare class ValidationError extends Error {
    errors: Record<string, string[]>;
    constructor(errors: ValidationErrors);
}
export declare class ValidationErrors {
    errors: Record<string, string[]>;
    constructor();
    add(name: string, error: string): void;
    hasErrors(): boolean;
    toString(joinNames?: string, joinErrors?: string): string;
}
export declare function mergeErrors(a: ValidationErrors, b: ValidationErrors): void;
export declare function validate(query: SQL, params: Record<string, any>, validators: Validator[]): Promise<ValidationErrors | null>;
