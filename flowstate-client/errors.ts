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
