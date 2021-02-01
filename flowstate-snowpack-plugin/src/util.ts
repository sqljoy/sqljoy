import ts from "typescript";

export interface Location {
    fileName: string;
    line: number;
}

export function partition<T>(a: T[], pred: (x: T) => boolean): [T[], T[]] {
    const t: T[] = [];
    const f: T[] = [];
    for (let x of a) {
        (pred(x) ? t : f).push(x);
    }
    return [t, f];
}

export function groupBy<T>(a: T[], key: (x: T) => string): Record<string, T[]> {
    return a.reduce((rv: Record<string, T[]>, x) => {
        const k = key(x);
        const g = rv[k] || [];
        g.push(x);
        rv[k] = g;
        return rv;
    }, {});
}

export function makeRelativePath(rootPath: string, path: string): string {
    if (rootPath.startsWith("./")) {
        rootPath = rootPath.substr(2);
    }
    const i = path.lastIndexOf(rootPath);
    if (i < 0) {
        return path;
    }

    return path.substr(i + rootPath.length);
}

export function objectShallowEquals(a: Record<string, any>, b: Record<string, any>): boolean {
    // Check all properties in a are equal to those in b.
    for (let k in a) {
        if (a.hasOwnProperty(k) && a[k] !== b[k]) {
            return false;
        }
    }
    // Check b doesn't have any properties not in a.
    for (let k in b) {
        if (b.hasOwnProperty(k) && a[k] === undefined) {
            return false;
        }
    }
    return true;
}

export function getLocation(node: ts.Node, sourceFile?: ts.SourceFile): Location {
    if (!sourceFile) {
        sourceFile = node.getSourceFile();
    }
    let {line} = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    line++
    return {fileName: sourceFile.fileName, line};
}