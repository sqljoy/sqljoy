import {isPromise} from "./util";
import {SQL} from "./sql";

/**
 * A validator callback that accumulates errors found in the param object into the ValidationErrors.
 *
 * If a param is not of the late-bound form like `%{name}` it will be named as a positional argument like $1, $2, etc.
 */
export type Validator = (errors: ValidationErrors, params: Record<string, any>) => Promise<void> | void;

/**
 * ValidationError is an error thrown when validation fails.
 *
 * It's designed to support showing validation errors for user input.
 *
 * @member message the errors as a string as formatted by {@link validationSummary}
 */
export class ValidationError extends Error {
    /**
     * An object mapping the invalid parameter name to an error. If there is
     * more than one error per parameter, only the first is recorded.
     */
    errors: Record<string, string>;
    /**
     * An array of errors that don't pertain to any individual parameter.
     */
    nonFieldErrors: string[];

    constructor(errors: Record<string, string> = {}, nonFieldErrors: string[] = []) {
        super(validationSummary(errors, nonFieldErrors));
        this.name = "ValidationError";
        this.errors = errors;
        this.nonFieldErrors = nonFieldErrors;
    }
}

/**
 * ValidationErrors accumulates validation errors in the errors property.
 *
 * It's designed to support showing validation errors for user input.
 */
export class ValidationErrors {
    /**
     * An object mapping the invalid parameter name to an error. If there is
     * more than one error per parameter, only the first is recorded.
     *
     * If an error doesn't pertain to any individual parameter,
     * it's stored in the {@link nonFieldErrors} array.
     */
    errors: Record<string, string>;
    /**
     * An array of errors that don't pertain to any individual parameter.
     */
    nonFieldErrors: string[];

    constructor() {
        this.errors = {};
        this.nonFieldErrors = [];
    }

    /**
     * Add an error if there isn't already an error for the passed parameter name.
     *
     * @param name - the parameter name. If falsey, the error is appended to nonFieldErrors.
     * @param error - the error to add
     */
    add(name: string | undefined, error: string) {
        if (!name) {
            this.nonFieldErrors.push(error);
        } else if (!this.errors[name]) {
            this.errors[name] = error;
        }
    }

    /**
     * hasErrors is true if this object contains any errors.
     */
    hasErrors(): boolean {
        if (this.nonFieldErrors.length !== 0) {
            return true;
        }
        for (let key in this.errors) {
            if (this.errors.hasOwnProperty(key)) {
                return true;
            }
        }
        return false;
    }
}

function addError(errors: ValidationErrors | null, key: string, err: string): ValidationErrors {
    if (errors == null) {
        errors = new ValidationErrors();
    }
    errors.add(key, err);
    return errors;
}

/**
 * validate is used by executeQuery to validate the query parameters with the
 * passed validator functions.
 *
 * It can be useful to call validate directly in cases where you want to validate
 * the user input (parameters) without executing the query yet. For example, if
 * you only have partial input or you're validating it as the user enters it.
 *
 * @param query
 * @param params
 * @param validators
 *
 * @category Advanced
 */
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

/**
 * Join all the errors into a single string by field separated with the join param.
 *
 * @param errors the errors by field name
 * @param nonFieldErrors non field errors - appended to the end, separated with join string
 * @param join the string to join each error with, defaults to "\n"
 */
export function validationSummary(errors: Record<string, string> = {}, nonFieldErrors: string[] = [], join="\n"): string {
    const names = Object.keys(errors);
    names.sort();
    const fieldErrors = names.map((k: string) => `${k}: ${errors[k]}`).join(join);
    return fieldErrors + join + join + nonFieldErrors.join(join);
}
