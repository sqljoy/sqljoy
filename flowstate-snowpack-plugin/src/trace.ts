import ts from "typescript";
import {makeRelativePath, getLocation} from "./util.js";

export class Tracer {
    srcDir: string;
    buf?: string[];
    indent: string | null;

    constructor(srcDir: string, buf?: string[]) {
        this.srcDir = srcDir;
        this.buf = buf;
        this.indent = null;
    }

    start(msg: string) {
        if (this.buf) {
            this.buf.push(msg);
            if (this.indent === null) {
                this.indent = "";
            } else {
                this.indent += "  ";
            }
        }
    }

    log(msg: string) {
        if (this.buf) {
            this.buf.push(msg);
        }
    }

    logNode(node: ts.Node, msg: string = "") {
        if (!this.buf) {
            return;
        }

        let {line, fileName} = getLocation(node);
        fileName = makeRelativePath(this.srcDir, fileName);

        if (msg) {
            msg = " - " + msg;
        }

        this.buf.push(`${this.indent || ""}${fileName}:${line} ${ts.SyntaxKind[node.kind]}${msg}`);
    }

    fail() {
        if (this.buf) {
            this.decIndent();
            if (this.indent === null) {
                for (const line of this.buf) {
                    console.log(line);
                }
                this.buf.length = 0;
            }
        }
    }

    pass() {
        if (this.buf) {
            this.decIndent();
            if (this.indent === null) {
                this.buf.length = 0;
            }
        }
    }

    private decIndent() {
        if (this.indent === "") {
            this.indent = null;
        } else {
            if (this.indent === null) {
                throw Error("print() without matching call to start()");
            }
            this.indent = this.indent.substr(0, this.indent.length - 2);
        }
    }
}