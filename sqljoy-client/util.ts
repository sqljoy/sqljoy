/**
 * Test if obj is a string.
 *
 * @param obj - the object to test
 *
 * @remarks
 * This does not cover object wrapped strings create with String()
 * but nobody uses that anyway.
 */
export function isString(obj: any): obj is string {
    return typeof obj === "string";
}

export function isFunction(obj: any): obj is Function {
    return typeof obj === "function";
}

export function isPromise(obj: any): obj is Promise<any> {
    return obj != null && isFunction(obj.then);
}

/**
 * Test if string ends with suffix
 * @param s
 * @param suffix
 */
export function endsWith(s: string, suffix: string): boolean {
    return s.indexOf(suffix, s.length - suffix.length) !== -1;
}

/**
 * Randomize array in-place using Durstenfeld shuffle algorithm
 * @param array
 */
export function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        let tmp = array[i];
        array[i] = array[j];
        array[j] = tmp;
    }
}

/**
 * A sleep function that returns a promise.
 *
 * @example
 * Sleep for 100ms
 * ```
 * await wait(100);
 * ```
 */
export async function wait(ms: number) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}