import { createServer } from "./composition-root.js";

const { connection } = createServer({
  reader: process.stdin,
  writer: process.stdout,
});

connection.listen();
