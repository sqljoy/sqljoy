import { SQL } from "./sql";
/**
 * A validator callback that accumulates errors found in the param object into the ValidationErrors.
 *
 * If a param is not of the late-bound form like `%{name}` it will be named as a positional argument like $1, $2, etc.
 */
export declare type Validator = (errors: ValidationErrors, params: Record<string, any>) => Promise<void> | void;
/**
 * ValidationError is an error thrown when validation fails.
 *
 * It's designed to support showing validation errors for user input.
 */
export declare class ValidationError extends Error {
    /**
     * An object mapping the invalid parameter name to an error. If there is
     * more than one error per parameter, only the first is recorded.
     */
    errors: Record<string, string>;
    /**
     * An array of errors that don't pertain to any individual parameter.
     */
    nonFieldErrors: string[];
    constructor(errors?: Record<string, string>, nonFieldErrors?: string[]);
}
/**
 * ValidationErrors accumulates validation errors in the errors property.
 *
 * It's designed to support showing validation errors for user input.
 */
export declare class ValidationErrors {
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
    constructor();
    /**
     * Add an error if there isn't already an error for the passed parameter name.
     *
     * @param name - the parameter name. If falsey, the error is appended to nonFieldErrors.
     * @param error - the error to add
     */
    add(name: string | undefined, error: string): void;
    /**
     * hasErrors is true if this object contains any errors.
     */
    hasErrors(): boolean;
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
export declare function validate(query: SQL, params: Record<string, any>, validators: Validator[]): Promise<ValidationErrors | null>;
/**
 *
 * @param errors
 * @param nonFieldErrors
 */
export declare function validationErrorSummary(errors?: Record<string, string>, nonFieldErrors?: string[], join?: string): string;