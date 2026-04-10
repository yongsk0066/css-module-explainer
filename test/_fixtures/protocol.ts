import { test as baseTest } from "vitest";
import {
  createInProcessServer,
  type InProcessServerOptions,
  type LspTestClient,
} from "../protocol/_harness/in-process-server";

/**
 * `test.extend` fixture for every Tier 2 protocol test.
 *
 * Replaces the `let client: LspTestClient | null = null;
 * afterEach(() => client?.dispose())` boilerplate that was
 * duplicated across every protocol file. Usage:
 *
 *   import { test, expect } from '../_fixtures/protocol.js';
 *
 *   test('returns something', async ({ makeClient }) => {
 *     const client = makeClient({ readStyleFile: ... });
 *     // no dispose needed — fixture auto-cleans after `use()`.
 *   });
 *
 * The fixture gives tests a `makeClient` factory (not a
 * pre-built client) so each test can supply its own
 * `InProcessServerOptions` while still getting free cleanup.
 */
export interface ProtocolFixtures {
  readonly makeClient: (options?: InProcessServerOptions) => LspTestClient;
}

export const test = baseTest.extend<ProtocolFixtures>({
  // Vitest `test.extend` destructures the first positional arg
  // (the fixtures) from an empty object when unused — the lint
  // rule flagging `no-empty-pattern` does not apply inside this
  // specific API.
  // eslint-disable-next-line no-empty-pattern
  makeClient: async ({}, use) => {
    const created: LspTestClient[] = [];
    const factory = (options?: InProcessServerOptions): LspTestClient => {
      const client = createInProcessServer(options);
      created.push(client);
      return client;
    };
    await use(factory);
    for (const client of created) client.dispose();
  },
});

export { expect } from "vitest";
