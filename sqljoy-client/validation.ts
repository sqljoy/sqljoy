import {isPromise} from "./util";
import {SQL} from "./sql";

export type Validator = (errors: ValidationErrors, params: Record<string, any>) => Promise<void> | void;

export class ValidationError extends Error {
    errors: ValidationErrors

    constructor(errors: ValidationErrors) {
        super("one or more validators failed");
        this.name = "ValidationError";
        this.errors = errors;
    }
}

export interface ValidationErrors {
    [name: string]: string[];
}

export function addError(self: ValidationErrors, name: string, error: string) {
    let errors = self[name] || [];
    errors.push(error);
    if (errors.length === 1) {
        self[name] = errors;
    }
}

export function hasErrors(self: ValidationErrors): boolean {
    for (let errorKey in self) {
        if (self.hasOwnProperty(errorKey)) {
            return true;
        }
    }
    return false;
}

export function mergeErrors(a: ValidationErrors, b: ValidationErrors) {
    for (let errorKey in b) {
        if (b.hasOwnProperty(errorKey)) {
            const rhs = b[errorKey];
            let lhs = a[errorKey];
            if (lhs === undefined) {
                lhs = rhs;
            } else {
                for (let err of rhs) {
                    lhs.push(err);
                }
            }
            a[errorKey] = lhs;
        }
    }
}

export function formatErrors(self: ValidationErrors, joinNames="\n", joinErrors="\n\t"): string {
    const names = Object.keys(self);
    names.sort();
    return names.map((k: string) => `${k}: ${self[k].join(joinErrors)}`).join(joinNames);
}

export async function validate(query: SQL, params: Record<string, any>, validators: Validator[]): Promise<ValidationErrors | null> {
    const errors: ValidationErrors = {};
    const promises: Promise<void>[] = [];
    for (let validator of validators) {
        const result = validator(errors, params);
        if (isPromise(result)) {
            promises.push(result);
        }
    }
    if (promises.length !== 0) {
        await Promise.all(promises);
    }
    if (hasErrors(errors)) {
        return errors
    }
    return null;
}
