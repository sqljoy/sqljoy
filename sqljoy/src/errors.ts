export enum Errors {
    ServerError = "ServerError",
    BadResult = "BadResult",
    ValidationError = "ValidationError",
}

export class ServerError extends Error {
    constructor(message: string, errorType: Errors = Errors.ServerError) {
        super(message);
        this.name = errorType;
    }

    type(): Errors {
        return this.name as Errors;
    }
}