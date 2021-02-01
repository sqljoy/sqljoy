export declare enum ServerEventType {
    INVALID = 0
}
export declare type Row = Record<string, any>;
export declare class Result implements IterableIterator<Row> {
    id: number;
    eventType: ServerEventType;
    columns: string[];
    rows: any[][];
    index: number;
    constructor(columns: string[], rows: any[][]);
    next(): IteratorResult<Row>;
    [Symbol.iterator](): IterableIterator<Row>;
}
