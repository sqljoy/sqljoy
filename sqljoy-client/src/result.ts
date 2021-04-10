enum ServerEvent {
    VersionChange = 'V',
    DataChange = 'D',
}

/**
 * An row object with string keys named after the names of the columns in the result set
 * and in the query order.
 *
 * @remarks Objects keys in JavaScript are ordered by insertion order, so they're guaranteed
 * to match the order the columns were selected if you iterate over them.
 */
export type Row = Record<string, any>;

/**
 * Result represents an iterable query result over the result rows as {@link Row} objects.
 *
 * If there are no rows in the result, the iterable is empty. A server function/transaction
 * can return arbitrary JSON including one or more Results.
 *
 * @remarks PostgreSQL doesn't have a client function to get the last inserted id.
 * It's recommended you use RETURNING id on your INSERT query, and the resulting
 * Result object will contain a single Row of {id: number}.
 */
export class Result implements IterableIterator<Row> {
    id: number = 0;
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