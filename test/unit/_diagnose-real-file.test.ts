/**
 * Diagnostic: run the server's analysis pipeline against the
 * real examples/src/scenarios/01-basic/BasicScenario.tsx file
 * on disk, without the LSP transport layer. This tells us
 * definitively whether the providers can resolve the user's
 * actual content.
 *
 * Not a test — a standalone diagnostic. Delete when the bug is
 * fixed.
 */

import { readFileSync } from "node:fs";
import { describe, it } from "vitest";
import ts from "typescript";
import { detectCxBindings } from "../../server/src/core/cx/binding-detector.js";
import { parseCxCalls } from "../../server/src/core/cx/call-parser.js";
import { parseStyleModule } from "../../server/src/core/scss/scss-index.js";
import { createInProcessServer } from "../protocol/_harness/in-process-server.js";

it("diagnose real examples/BasicScenario.tsx", () => {
  const tsxPath =
    "/Users/yongseok/dev/css-module-explainer/examples/src/scenarios/01-basic/BasicScenario.tsx";
  const scssPath =
    "/Users/yongseok/dev/css-module-explainer/examples/src/scenarios/01-basic/Button.module.scss";

  const content = readFileSync(tsxPath, "utf8");
  console.log("=== TSX file ===");
  console.log(`path: ${tsxPath}`);
  console.log(`length: ${content.length}`);
  console.log(`'classnames/bind' present: ${content.includes("classnames/bind")}`);
  console.log();

  const sourceFile = ts.createSourceFile(
    tsxPath,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const bindings = detectCxBindings(sourceFile, tsxPath);
  console.log("=== detectCxBindings ===");
  console.log(`found ${bindings.length} binding(s)`);
  for (const b of bindings) {
    console.log(
      `  cxVarName=${b.cxVarName}, stylesVarName=${b.stylesVarName}, scssModulePath=${b.scssModulePath}, scope=${JSON.stringify(b.scope)}`,
    );
  }
  console.log();

  console.log("=== parseCxCalls ===");
  for (const binding of bindings) {
    const calls = parseCxCalls(sourceFile, binding);
    console.log(`binding ${binding.cxVarName}: ${calls.length} call(s)`);
    for (const call of calls) {
      const range = `${call.originRange.start.line}:${call.originRange.start.character}-${call.originRange.end.line}:${call.originRange.end.character}`;
      if (call.kind === "static") {
        console.log(`  [${range}] static: '${call.className}'`);
      } else if (call.kind === "template") {
        console.log(`  [${range}] template: prefix='${call.staticPrefix}'`);
      } else {
        console.log(`  [${range}] variable: '${call.variableName}'`);
      }
    }
  }
  console.log();

  console.log("=== parseStyleModule (SCSS) ===");
  const scssContent = readFileSync(scssPath, "utf8");
  const classMap = parseStyleModule(scssContent, scssPath);
  console.log(`path: ${scssPath}`);
  console.log(`class count: ${classMap.size}`);
  for (const [name, info] of classMap.entries()) {
    console.log(
      `  .${name} @ ${info.range.start.line}:${info.range.start.character} — ${info.declarations.slice(0, 60)}`,
    );
  }
});

describe("end-to-end LSP against the real file", () => {
  it("hover at cx('button') returns a Hover via the Tier 2 harness", async () => {
    const tsxPath =
      "/Users/yongseok/dev/css-module-explainer/examples/src/scenarios/01-basic/BasicScenario.tsx";
    const scssPath =
      "/Users/yongseok/dev/css-module-explainer/examples/src/scenarios/01-basic/Button.module.scss";
    const tsxContent = readFileSync(tsxPath, "utf8");
    const scssContent = readFileSync(scssPath, "utf8");
    const uri = `file://${tsxPath}`;

    const client = createInProcessServer({
      readStyleFile: (p) => (p === scssPath ? scssContent : null),
    });
    try {
      const initResult = await client.initialize({
        rootUri: "file:///Users/yongseok/dev/css-module-explainer/examples",
        workspaceFolders: [
          {
            uri: "file:///Users/yongseok/dev/css-module-explainer/examples",
            name: "examples",
          },
        ],
      });
      console.log("\n=== initialize result ===");
      console.log(JSON.stringify(initResult.capabilities, null, 2));

      client.initialized();
      client.didOpen({
        textDocument: {
          uri,
          languageId: "typescriptreact",
          version: 1,
          text: tsxContent,
        },
      });

      // Line 25 col 27 is inside `'button'` on:
      //   className={cx("button", "primary", size, { disabled })}
      // parseCxCalls above showed [25:25-25:31] static: 'button'.
      const hover = await client.hover({
        textDocument: { uri },
        position: { line: 25, character: 28 },
      });
      console.log("\n=== hover at (25, 28) ===");
      console.log(JSON.stringify(hover, null, 2));

      const def = await client.definition({
        textDocument: { uri },
        position: { line: 25, character: 28 },
      });
      console.log("\n=== definition at (25, 28) ===");
      console.log(JSON.stringify(def, null, 2));
    } finally {
      client.dispose();
    }
  });
});
