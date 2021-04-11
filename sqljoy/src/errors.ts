/**
 * Errors is an enumeration of specific predefined server errors.
 */
export enum Errors {
    ServerError = "ServerError",
    BadResult = "BadResult",
    ValidationError = "ValidationError",
}

/**
 * An Error representing an error returned by the server.
 *
 * @member name - the errorType {@link Errors} from the server
 */
export class ServerError extends Error {
    constructor(message: string, errorType: Errors = Errors.ServerError) {
        super(message);
        this.name = errorType;
    }

    /**
     *
     */
    type(): Errors {
        return this.name as Errors;
    }
}