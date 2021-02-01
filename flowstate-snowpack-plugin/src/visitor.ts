import ts from "typescript";
import path from "path";
import {mergeQueries, renumberVars, replaceParams, SQL, SQLFromQuery, Validator} from "./sql.js";
import {Tracer} from "./trace.js";
import {getLocation, Location} from "./util.js";

// We need to find and extract all queries.
// Queries are created with a tagged template literal sql``.
// They're executed via the method FlowState::execute.
// We need to be able to statically determine the full query passed to execute to build the whitelist.
//
// Current limitations:
const RULES = [
    `The sql template tag cannot be renamed or aliased, it must be exactly sql\`...\`.`,
    `The execute function must be used as a method call, e.g. fs.executeQuery(...),
     it cannot be assigned to a variable, destructured, or accessed as an index (e.g. fs["executeQuery"]).`,
    `executeQuery params must be an object that can be serialized to and from JSON without loss.`,
    `Validation functions must be names defined in or imported into the source file, at the file level.
     This means validation functions cannot be closures (if you need state, add it to the params object).`,
    `The query must be provided as a tagged template literal inline, or as a variable or property access
     that is trivially and unconditionally declared from a tagged template literal. The query may not be passed 
     into or returned from a function, modified, or conditionally or dynamically defined in any way. If
     the query is specified as a property access expression (e.g. foo.executeQuery(namespace.query)) then namespace
     must be a single-level access expression and the namespace must be named in an import in the same file.`,
    `Imports and exports of queries and validation functions must use ES6 syntax.`,
];
// Not all of these limitations are fundamental, we welcome pull requests to address them.

let PRINTED_RULES = true;

export interface Options {
    src: string;
    verbose: boolean;
}

export function visitorFactory(opts: Options, typeChecker: ts.TypeChecker, sourceFile: ts.SourceFile, queries: Record<string, SQL>): (node: ts.Node) => void {
    const trace = new Tracer(opts.src, opts.verbose ? [] : undefined)
    const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node)) {
            const call = node as ts.CallExpression;
            // Identify all potential executeQuery or paginateQuery method calls, and then we'll work backward
            // from them to get the sql queries and validation functions.
            if (isQueryExecute(call)) {
                const query = call.arguments[0];
                const bindParams = call.arguments[1];
                const validators = getFunctionDeclarations(trace, typeChecker, sourceFile, call.arguments.slice(2));
                const sql = getSQLQuery(trace, typeChecker, query);

                if (sql === null) {
                    printError("could not resolve query", call, sourceFile);
                } else {
                    replaceParams(sql);
                    if (validators !== null) {
                        sql.validators = {};
                        for (let name in validators) {
                            sql.validators[name] = getValidator(validators[name]);
                        }
                    }
                    sql.referenced.push(getLocation(node, sourceFile));
                    const exists = queries[sql.query];
                    if (exists) {
                        mergeQueries(exists, sql);
                    } else {
                        queries[sql.query] = sql;
                    }
                    console.log(`${path.basename(sql.fileName)}:${sql.line}`, sql.query, sql.params);
                }
            } else if (isBackendCall(call)) { // identify beginTx() method calls (Context argument to backend call)
                const parent = call.parent;
                if (ts.isCallExpression(parent) && parent.arguments[0] == call) {
                    // This looks like a backend call, let's find the function
                    const decl = getBackendFunction(trace, typeChecker, sourceFile, parent.expression);
                    console.log("call", getLocation(parent, sourceFile));
                    console.log(decl);
                }
            }
        }

        ts.forEachChild(node, visit);
    }
    return visit;
}

function isQueryExecute(node: ts.CallExpression): boolean {
    const expr = node.expression;
    if (!ts.isPropertyAccessExpression(expr) || node.arguments.length === 0) {
        return false;
    }
    const methodName = expr.name.escapedText.toString();
    return methodName === "executeQuery" || methodName === "paginateQuery";
}

function isBackendCall(node: ts.CallExpression): boolean {
    const expr = node.expression;
    if (!ts.isPropertyAccessExpression(expr) || node.arguments.length !== 0) {
        return false;
    }
    const methodName = expr.name.escapedText.toString();
    return methodName === "beginTx";
}

function isExported(node: ts.Node): boolean {
    return node.modifiers !== undefined && node.modifiers[0] !== undefined && node.modifiers[0].kind === ts.SyntaxKind.ExportKeyword;
}

function isExportedVariableOrFunction(node: ts.Node): boolean {
    // See: https://developer.mozilla.org/en-US/docs/web/javascript/reference/statements/export
    // For all the myriad export syntax elements we have to support.
    return node.parent && ((ts.isVariableDeclaration(node) && ts.isVariableStatement(node.parent.parent) && isExported(node.parent.parent)) ||
        (ts.isFunctionDeclaration(node) && node.name !== undefined) ||
        ts.isExportAssignment(node.parent));
}

function isFunction(node: ts.Node): boolean {
    return ts.isFunctionDeclaration(node) || ts.isArrowFunction(node);
}

function functionIsExported(func: ts.FunctionDeclaration, typeChecker: ts.TypeChecker, sourceFile: ts.SourceFile, name: string): boolean {
    if (isExported(func)) {
        return true;
    }

    // It might still be exported at another location in the source file, look for it in exports
    const nsSymbol = typeChecker.getSymbolAtLocation(sourceFile);
    if (getExportedSymbol(nsSymbol, name)) {
        return true;
    }

    // TODO check the default export? how?
    return false;
}

function getBackendFunction(trace: Tracer, typeChecker: ts.TypeChecker, sourceFile: ts.SourceFile, func: ts.Expression) {
    return getFunctionDeclarations(trace, typeChecker, sourceFile, [func]);
}

function getValidator(decl: ts.Node): Validator {
    let val = getLocation(decl);
    return val;
}

function getFunctionDeclarations(trace: Tracer, typeChecker: ts.TypeChecker, sourceFile: ts.SourceFile, functions: ts.Expression[]): Record<string, ts.Node> | null {
    // results is a map of exported name to source module node
    let results: Record<string, ts.Node> | null = {};
    for (let validator of functions) {
        // Follow the declarations of validator, stopping at an export
        trace.start(`find exported variable or function for ${validator.getText(sourceFile)}`);
        let node = lookupMatchingDeclaration(trace, isExportedVariableOrFunction, typeChecker, validator);
        if (node) {
            // Node is now one of:
            // 1) A VariableDeclaration that is grandchild of an exported VariableStatement: export const foo = ...
            //    the initializer might be an arrow function, or it might be an expression that can be resolved to a function or arrow function.
            // 2) A named FunctionDeclaration that is exported (the validation function): export function foo(...) {
            // 3) A child of an ExportAssignment: export default ...

            let name: string = "";
            if (ts.isFunctionDeclaration(node)) {
                name = node.name!.escapedText.toString();
                console.log(name, node.getSourceFile() === sourceFile, functionIsExported(node, typeChecker, sourceFile, name));
                if (node.getSourceFile() === sourceFile && !functionIsExported(node, typeChecker, sourceFile, name)) {
                    trace.logNode(node, `function ${name} not exported`);
                    trace.fail();
                    results = null;
                } else {
                    trace.logNode(node, `found validator function ${name}`);
                    trace.pass();
                    if (results !== null) {
                        results[name] = node;
                    }
                }
                continue;
            }
            // For the other cases, set node to the exported expression, and then try to resolve it to a function or arrow function.
            else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
                if (node.initializer) {
                    name = node.name.escapedText.toString();
                    node = node.initializer;
                }
            } else if (ts.isExportAssignment(node.parent)) {
                name = "default"; // ExportAssignment seems to be only for default exports
            }
            // Can we resolve this expression back to a function or arrow function?
            if (name !== "") {
                trace.start(`find function or arrow function for ${name}`);
                if (lookupMatchingDeclaration(trace, isFunction, typeChecker, node)) {
                    // That export referred to a server callable validator function then
                    trace.log(`found validator in ${path.basename(node.getSourceFile().fileName)}`);
                    trace.pass();
                    trace.pass();
                    if (results !== null) {
                        results[name] = node;
                    }
                    continue;
                } else {
                    trace.fail();
                    results = null;
                }
            }
        }
        trace.fail();
        printError(`could not resolve validator`, validator, sourceFile, true);
    }
    return results;
}

function getSQLQuery(trace: Tracer, typeChecker: ts.TypeChecker, node?: ts.Node): SQL | null {
    trace.start("find TaggedTemplateExpression");
    const template = lookupMatchingDeclaration(trace, ts.isTaggedTemplateExpression, typeChecker, node);
    if (!template) {
        trace.fail();
        return null;
    }
    const sql = getQueryFromTemplate(trace, typeChecker, template as ts.TaggedTemplateExpression);
    if (sql !== null) {
        trace.pass();
    }
    return sql;
}

function lookupMatchingDeclaration(trace: Tracer, filter: (node: ts.Node) => boolean, typeChecker: ts.TypeChecker, node?: ts.Node): ts.Node | undefined {
    // We need to follow node back through a possible trail of
    // assignments, imports/exports, and namespace property accesses
    // until we either reach a node matching filter is found (the passed node itself is also tested with filter.)

    let symbol: ts.Symbol | undefined;
    let props: string[] = [];
    while (node) {
        if (filter(node)) {
            trace.logNode(node, "found matching node");
            return node;
        }

        //console.log("prop", props);
        if (props.length !== 0) {
            //console.log("looking for export=", props[props.length - 1], "on=", symbol && symbol.name);
            const expSymbol = getExportedSymbol(symbol, props[props.length - 1]);
            if (expSymbol) {
                //console.log("found export=", expSymbol.name);
                symbol = expSymbol;
                props.pop();
                node = findDeclaration(trace, typeChecker, node, symbol);
                continue;
            }
        }

        if (ts.isIdentifier(node)) {
            trace.logNode(node, node.text);
            symbol = typeChecker.getSymbolAtLocation(node);
        } else if (ts.isPropertyAccessExpression(node)) {
            trace.logNode(node, `access property ${node.name.text}`);
            props.push(node.name.text);
            node = node.expression;
            continue;
        } else if (ts.isVariableDeclaration(node)) {
            trace.logNode(node, node.initializer ? `= ${ts.SyntaxKind[node.initializer.kind]}` : undefined);
            node = node.initializer;
            continue;
        } else {
            symbol = lookupImportedSymbol(trace, typeChecker, node, symbol);
        }

        if (!symbol) {
            trace.log("failed to find symbol");
            break;
        }
        node = findDeclaration(trace, typeChecker, node, symbol);
    }
}

function lookupImportedSymbol(trace: Tracer, typeChecker: ts.TypeChecker, node?: ts.Node, symbol?: ts.Symbol): ts.Symbol | undefined {
    if (!node || !symbol) {
        return;
    }

    if (ts.isImportSpecifier(node) || ts.isImportClause(node)) {
        trace.logNode(node, `imported symbol ${symbol.name}`);
        return typeChecker.getAliasedSymbol(symbol);
    } else if (ts.isExportSpecifier(node)) {
        trace.logNode(node, `imported symbol ${symbol.name}`);
        return typeChecker.getAliasedSymbol(symbol);
    } else if (ts.isNamespaceImport(node) || ts.isNamespaceExport(node)) {
        trace.logNode(node, `namespace ${symbol.name}`);
        do {
            node = node.parent;
        } while (node && !ts.isImportDeclaration(node) && !ts.isExportDeclaration(node));

        const moduleSpecifier = node.moduleSpecifier;
        if (moduleSpecifier) {
            trace.log(`looking up module ${moduleSpecifier.getText()}`)
            return typeChecker.getSymbolAtLocation(moduleSpecifier);
        }
    } else {
        trace.logNode(node, "unsupported node type");
    }
}

function getExportedSymbol(nsSymbol: ts.Symbol | undefined, name: string): ts.Symbol | undefined {
    if (nsSymbol && nsSymbol.exports) {
        return nsSymbol.exports.get(ts.escapeLeadingUnderscores(name));
    }
}

function findDeclaration(trace: Tracer, typeChecker: ts.TypeChecker, node: ts.Node, symbol: ts.Symbol): ts.Node | undefined {
    const declarations = symbol.getDeclarations();
    if (declarations && declarations.length !== 0) {
        let sameFile: ts.Declaration | undefined;
        if (declarations.length !== 1) {
            // Prefer the declaration in the same file as node
            // TODO we really need to actually figure out which of these declarations is currently the one in scope
            // but that's a harder problem that will have to wait.
            const sourceFile = node.getSourceFile();
            sameFile = declarations.filter((decl) => decl.getSourceFile() === sourceFile).pop();
        }

        trace.log(`found ${declarations.length} declarations${sameFile ? ", choosing last from same file" : ""}`);

        return sameFile || declarations[0];
    }
}

function getQueryFromTemplate(trace: Tracer, typeChecker: ts.TypeChecker, node: ts.TaggedTemplateExpression, verbose: boolean = false): SQL | null {
    if (!ts.isIdentifier(node.tag) || node.tag.escapedText !== "sql") {
        return null;
    }

    const template = node.template;
    let query: SQL | null = null;
    if (ts.isNoSubstitutionTemplateLiteral(template)) {
        query = SQLFromQuery(template.rawText || "");
    } else if (ts.isTemplateExpression(template)) {
        const sourceFile = node.getSourceFile();
        const parts = [template.head.rawText || ""];
        let paramCount = 0;
        const params: Record<string, string> = {};
        for (let {expression, literal} of template.templateSpans) {
            if (ts.isIdentifier(expression) || ts.isPropertyAccessExpression(expression)) {
                const nested = getSQLQuery(trace, typeChecker, expression);
                if (nested !== null) {
                    const query = renumberVars(nested.query, nested.paramCount);
                    paramCount += nested.paramCount;
                    parts.push(query);
                } else {
                    let name = expression.getText(sourceFile);
                    name = name.replace(/\./g, "_");
                    params[name] = "string";
                    parts.push(`$${++paramCount}`);
                }
            } else {
                const v = `$${++paramCount}`;
                params[v] = "string";
                parts.push(v);
            }
            parts.push(literal.rawText || "");
        }
        query = SQLFromQuery(parts.join(""), paramCount, params);
    }

    if (query !== null) {
        const {fileName, line} = getLocation(template);
        query.fileName = fileName;
        query.line = line;
    }

    return query;
}

function printRules() {
    if (PRINTED_RULES) {
        return;
    }

    console.log("Warning: some queries could not be statically resolved. Whitelist is incomplete.");
    console.log("The current limitations (PRs welcomed!) are:");
    let i = 0;
    for (let rule of RULES) {
        console.log(`${++i}) ${rule.replace(/\s\s+/g, "\n   ")}`);
    }
    console.log("");

    PRINTED_RULES = true;
}

function printError(msg: string, node: ts.Node, sourceFile?: ts.SourceFile, singleLine: boolean = false) {
    printRules();

    const {line, fileName} = getLocation(node, sourceFile);

    const sep = singleLine ? ": " : "\n\t";

    console.error(`${fileName}:${line}: ${msg}${sep}${node.getText(sourceFile)}`);
}

export function hadError(): boolean {
    return PRINTED_RULES;
}