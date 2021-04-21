/**
 * The server runtime.
 *
 * @module sqljoy-runtime (server)
 */

// For security reasons the runtime has to be imported before user code in userTasks
// We edit the builtins/globals.

export {Context} from "./context";
import "./dynamic_sql";
export const sql = (globalThis as any).sql;
export {SQL, isSQL} from "./sql";
export * from "./validation";