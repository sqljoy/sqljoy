export type Row = Record<string, any>;

export class Result implements IterableIterator<Row> {
    id: number = 0;
    eventType?: string; // only set for server initiated events
    columns: string[];
    rows: any[][];
    index: number = 0;

    constructor(columns: string[], rows: any[][]) {
        if (!Array.isArray(columns) || !Array.isArray(rows)) {
            throw Error("invalid result: expected columns and rows to be arrays");
        }
        this.columns = columns;
        this.rows = rows;
    }

    next(): IteratorResult<Row> {
        if (this.index >= this.rows.length || this.index < 0) {
            return {"value": null, "done": true};
        }

        const data = this.rows[this.index];
        if (data.length !== this.columns.length) {
            throw Error("invalid result: row length doesn't match columns length");
        }
        const row: Row = {};
        for (let i=0; i < data.length; i++) {
            row[this.columns[i]] = data[i];
        }
        ++this.index;
        return {"value": row};
    }

    [Symbol.iterator](): IterableIterator<Row> {
        return this;
    }
}