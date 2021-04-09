import {isPromise} from "./util";
import {SQL} from "./sql";

export type Validator = (errors: ValidationErrors, params: Record<string, any>) => Promise<void> | void;

export class ValidationError extends Error {
    errors: Record<string, string[]>;

    constructor(errors: ValidationErrors) {
        super(errors.toString());
        this.name = "ValidationError";
        this.errors = errors.errors;
    }
}

export class ValidationErrors {
    errors: Record<string, string[]>;

    constructor() {
        this.errors = {};
    }

    add(name: string, error: string) {
        let errors = this.errors[name] || [];
        errors.push(error);
        if (errors.length === 1) {
            this.errors[name] = errors;
        }
    }

    hasErrors(): boolean {
        for (let key in this.errors) {
            if (this.errors.hasOwnProperty(key) && this.errors[key].length !== 0) {
                return true;
            }
        }
        return false;
    }

    toString(joinNames="\n", joinErrors="\n\t"): string {
        const names = Object.keys(this.errors);
        names.sort();
        return names.map((k: string) => `${k}: ${this.errors[k].join(joinErrors)}`).join(joinNames);
    }
}

export function mergeErrors(a: ValidationErrors, b: ValidationErrors) {
    for (let errorKey in b.errors) {
        if (b.errors.hasOwnProperty(errorKey)) {
            const rhs = b.errors[errorKey];
            let lhs = a.errors[errorKey];
            if (lhs === undefined) {
                lhs = rhs;
            } else {
                for (let err of rhs) {
                    lhs.push(err);
                }
            }
            a.errors[errorKey] = lhs;
        }
    }
}

function addError(errors: ValidationErrors | null, key: string, err: string): ValidationErrors {
    if (errors == null) {
        errors = new ValidationErrors();
    }
    errors.add(key, err);
    return errors;
}

export async function validate(query: SQL, params: Record<string, any>, validators: Validator[]): Promise<ValidationErrors | null> {
    let errors: ValidationErrors | null = (validators.length === 0) ? null : new ValidationErrors();

    // Make sure all of the params have been provided.
    // If any parameter in params is undefined, treat that as an error.
    // If the user wants null, they must pass null explicitly (or param || null) otherwise it can hide errors.
    // Flag any missing late-bound params that are still set to __PARAM_.
    for (let param in params) {
        if (params.hasOwnProperty(param)) {
            if (param === undefined) {
                errors = addError(errors, param, "param is undefined, use null if you mean null");
            } else if (param === "__PARAM_") {
                errors = addError(errors, param, `missing value for late-bound %{${param}}: pass it in executeQuery(..., params, ...)`);
            }
        }
    }

    const promises: Promise<void>[] = [];
    for (let validator of validators) {
        const result = validator(errors!, params);
        if (isPromise(result)) {
            promises.push(result);
        }
    }
    if (promises.length !== 0) {
        await Promise.all(promises);
    }
    if (errors !== null && errors.hasErrors()) {
        return errors
    }
    return null;
}
