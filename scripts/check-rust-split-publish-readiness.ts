import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { get } from "node:https";
import { tmpdir } from "node:os";
import path from "node:path";

type PublishReadyRepo = {
  readonly kind: "publish-ready";
  readonly label: string;
  readonly repo: string;
  readonly packageName: string;
  readonly libName?: string;
  readonly expectedRegistryDependencies?: readonly string[];
};

type SplitRepo = PublishReadyRepo;

const splitRepos: readonly SplitRepo[] = [
  {
    kind: "publish-ready",
    label: "input-producers",
    repo: "omenien/omena-engine-input-producers",
    packageName: "omena-engine-input-producers",
    libName: "engine_input_producers",
  },
  {
    kind: "publish-ready",
    label: "style-parser",
    repo: "omenien/omena-engine-style-parser",
    packageName: "omena-engine-style-parser",
    libName: "engine_style_parser",
  },
  {
    kind: "publish-ready",
    label: "semantic",
    repo: "omenien/omena-semantic",
    packageName: "omena-semantic",
    expectedRegistryDependencies: ["omena-engine-input-producers", "omena-engine-style-parser"],
  },
] as const;

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "omena-split-publish-readiness."));

  try {
    for (const repo of splitRepos) {
      const checkoutPath = path.join(tempRoot, repo.label);
      execFileSync(
        "git",
        ["clone", "--quiet", `https://github.com/${repo.repo}.git`, checkoutPath],
        {
          stdio: "inherit",
        },
      );
      const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
        cwd: checkoutPath,
        encoding: "utf8",
      }).trim();
      const manifest = readFileSync(path.join(checkoutPath, "Cargo.toml"), "utf8");
      process.stdout.write(`== rust-split-publish-readiness:${repo.label}@${commit} ==\n`);

      assertManifestBasics(manifest, repo.packageName, repo.repo);
      runCargo(checkoutPath, ["fmt", "--all", "--check"]);
      runCargo(checkoutPath, ["test"]);
      runCargo(checkoutPath, ["clippy", "--all-targets", "--all-features", "--", "-D", "warnings"]);

      assert.ok(
        !/^publish\s*=\s*false$/m.test(manifest),
        `${repo.packageName}: publish-ready packages must not set publish = false`,
      );
      if (repo.libName !== undefined) {
        assert.match(
          manifest,
          new RegExp(String.raw`^\[lib\]\s*\nname = "${repo.libName}"`, "m"),
          `${repo.packageName}: expected stable Rust lib import name ${repo.libName}`,
        );
      }
      for (const registryDependency of repo.expectedRegistryDependencies ?? []) {
        assert.match(
          manifest,
          new RegExp(String.raw`package = "${registryDependency}", version = "0\.1\.0"`),
          `${repo.packageName}: expected registry dependency ${registryDependency}@0.1.0`,
        );
      }
      // oxlint-disable-next-line eslint/no-await-in-loop
      const status = await cratesIoStatus(repo.packageName);
      assert.equal(status, 200, `${repo.packageName}: expected published crate on crates.io`);
      runCargo(checkoutPath, ["publish", "--dry-run"]);
      process.stdout.write(
        `validated published split crate: package=${repo.packageName} cratesIoStatus=${status}\n\n`,
      );
    }
  } finally {
    rmSync(tempRoot, { force: true, recursive: true });
  }
}

function assertManifestBasics(manifest: string, packageName: string, repo: string) {
  assert.match(manifest, new RegExp(String.raw`^name = "${packageName}"$`, "m"));
  assert.match(manifest, /^version = "0\.1\.0"$/m);
  assert.match(manifest, /^edition = "2024"$/m);
  assert.match(manifest, /^license = "MIT"$/m);
  assert.match(manifest, new RegExp(String.raw`^repository = "https://github.com/${repo}"$`, "m"));
  assert.match(manifest, /^readme = "README\.md"$/m);
  assert.match(manifest, /^keywords = \[/m);
  assert.match(manifest, /^categories = \[/m);
}

function runCargo(cwd: string, args: readonly string[]) {
  execFileSync("cargo", args, {
    cwd,
    env: {
      ...process.env,
      RUSTUP_TOOLCHAIN: "stable",
    },
    stdio: "inherit",
  });
}

function cratesIoStatus(crateName: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = get(
      `https://crates.io/api/v1/crates/${crateName}`,
      {
        headers: {
          "User-Agent": "css-module-explainer split publish readiness check",
        },
      },
      (response) => {
        response.resume();
        response.on("end", () => {
          resolve(response.statusCode ?? 0);
        });
      },
    );
    request.on("error", reject);
    request.end();
  });
}
