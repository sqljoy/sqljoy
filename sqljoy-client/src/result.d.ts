export declare enum ServerEvent {
    VersionChange = "V",
    DataChange = "D"
}
export declare type Row = Record<string, any>;
/**
 * Result represents a
 */
export declare class Result implements IterableIterator<Row> {
    id: number;
    eventType: ServerEvent | null;
    columns: string[];
    rows: any[][];
    index: number;
    constructor(columns: string[], rows: any[][]);
    next(): IteratorResult<Row>;
    [Symbol.iterator](): IterableIterator<Row>;
}
