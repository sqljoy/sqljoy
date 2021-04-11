export declare enum Errors {
    ServerError = "ServerError",
    BadResult = "BadResult",
    ValidationError = "ValidationError"
}
export declare class ServerError extends Error {
    constructor(message: string, errorType?: Errors);
    type(): Errors;
}
