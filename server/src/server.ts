import { createServer } from "./composition-root.js";

// No reader/writer — createServer auto-detects transport from
// process.argv flags set by the LanguageClient (TransportKind.ipc
// passes --node-ipc, TransportKind.stdio passes --stdio).
const { connection } = createServer({});

connection.listen();
