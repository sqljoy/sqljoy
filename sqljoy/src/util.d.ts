/**
 * Test if obj is a string.
 *
 * @param obj - the object to test
 *
 * @remarks
 * This does not cover object wrapped strings create with String()
 * but nobody uses that anyway.
 */
export declare function isString(obj: any): obj is string;
export declare function isFunction(obj: any): obj is Function;
export declare function isPromise(obj: any): obj is Promise<any>;
/**
 * Test if string ends with suffix
 * @param s
 * @param suffix
 */
export declare function endsWith(s: string, suffix: string): boolean;
/**
 * Randomize array in-place using Durstenfeld shuffle algorithm
 * @param array
 */
export declare function shuffleArray(array: any[]): void;
/**
 * A sleep function that returns a promise.
 *
 * @example
 * Sleep for 100ms
 * ```
 * await wait(100);
 * ```
 */
export declare function wait(ms: number): Promise<unknown>;
