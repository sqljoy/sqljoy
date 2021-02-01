import ts from "typescript";
import fs from "fs";
import path from "path";
import {Options, hadError, visitorFactory} from "./visitor.js";
import {SQL} from "./sql.js";
import {writeWhitelists} from "./whitelist.js";

export {Options} from "./visitor.js";

export function compile(opts: Options): boolean {
    if (opts.src === "" || opts.src === ".") {
        opts.src = process.cwd();
    }
    if (opts.src.charAt(opts.src.length - 1) !== "/") {
        opts.src += "/";
    }

    const host: ts.ParseConfigFileHost = ts.sys as any;
    const configFile = path.join(opts.src, "tsconfig.json");
    let options: ts.CompilerOptions;
    let fileNames: string[];
    if (fs.existsSync(configFile)) {
        // TODO
        //host.onUnRecoverableConfigFileDiagnostic = printDiagnostic;
        const parsedCmd = ts.getParsedCommandLineOfConfigFile(configFile, {}, host);
        if (!parsedCmd) {
            console.log("failed to parse config file: ${configFile}");
            return false;
        }
        //host.onUnRecoverableConfigFileDiagnostic = undefined;
        fileNames = parsedCmd.fileNames;
        options = parsedCmd.options;
    } else {
        let srcDir = path.join(opts.src, "src/");
        if (!fs.existsSync(srcDir)) {
            srcDir = opts.src;
        }
        fileNames = [`${path.join(srcDir, "index.ts")}`, `${path.join(srcDir, "index.js")}`];
        options = {
            allowJs: true,
            noEmitOnError: true,
            target: ts.ScriptTarget.ES2015,
            module: ts.ModuleKind.ES2015,
            moduleResolution: ts.ModuleResolutionKind.NodeJs,
        };
    }

    console.log({fileNames, "verbose": opts.verbose});

    const program = ts.createProgram({
        rootNames: fileNames,
        options,
    });

    const typeChecker = program.getTypeChecker();

    const queries: Record<string, SQL> = {};
    try {
        // Visit every sourceFile in the program
        for (const sourceFile of program.getSourceFiles()) {
            if (!sourceFile.isDeclarationFile) {
                ts.forEachChild(sourceFile, visitorFactory(opts, typeChecker, sourceFile, queries));
            }
        }

        writeWhitelists(opts.src, Object.values(queries));

        return !hadError();
    } catch(err) {
        console.error(err);
        return false;
    }
}
