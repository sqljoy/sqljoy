import { compile, Options } from "./compiler.js";

yargs(hideBin(process.argv))
    .command("build [src]", "generate whitelists and server.js", (yargs) => {
        return yargs.positional("src", {
            default: "",
            describe: "the source directory or entry point of the Flow State application",
        }).option("v", {
            alias: "verbose",
            type: "boolean",
            describe: "output trace information for the AST nodes navigated for unresolved symbols",
        });
    }, (args: Arguments<Options>) => {
        if (!compile(args)) {
            process.exit(1);
        }
    })
    .strict()
    .demandCommand(1, "command not specified, did you mean build or deploy?")
    .help()
    .parse();