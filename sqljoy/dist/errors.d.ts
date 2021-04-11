/**
 * Errors is an enumeration of some predefined server errors.
 */
export declare enum Errors {
    ServerError = "ServerError",
    BadResult = "BadResult",
    ValidationError = "ValidationError"
}
/**
 * An Error representing an error returned by the server.
 *
 * @member name - the errorType {@link Errors} from the server
 */
export declare class ServerError extends Error {
    constructor(message: string, errorType?: Errors);
    /**
     *
     */
    type(): Errors;
}
