export interface ValidationErrors {
    [name: string]: string[];
}
export declare function addError(self: ValidationErrors, name: string, error: string): void;
export declare function hasErrors(self: ValidationErrors): boolean;
export declare function mergeErrors(a: ValidationErrors, b: ValidationErrors): void;
export declare function formatErrors(self: ValidationErrors, joinNames?: string, joinErrors?: string): string;
