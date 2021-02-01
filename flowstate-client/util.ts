// Note this does not cover object wrapped strings create with String()
// but nobody uses that anyway.
export function isString(obj: any): obj is string {
    return typeof obj === "string";
}

export function isFunction(obj: any): obj is Function {
    return typeof obj === "function";
}

export function isPromise(obj: any): obj is Promise<any> {
    return obj != null && isFunction(obj.then);
}

export function endsWith(s: string, suffix: string): boolean {
    return s.indexOf(suffix, s.length - suffix.length) !== -1;
}