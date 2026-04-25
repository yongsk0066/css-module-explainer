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
  readonly libName: string;
};

type BlockedRepo = {
  readonly kind: "blocked";
  readonly label: string;
  readonly repo: string;
  readonly packageName: string;
  readonly expectedPackageAliases: readonly string[];
};

type SplitRepo = PublishReadyRepo | BlockedRepo;

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
    kind: "blocked",
    label: "semantic",
    repo: "omenien/omena-semantic",
    packageName: "omena-semantic",
    expectedPackageAliases: ["omena-engine-input-producers", "omena-engine-style-parser"],
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

      if (repo.kind === "publish-ready") {
        assert.ok(
          !/^publish\s*=\s*false$/m.test(manifest),
          `${repo.packageName}: publish-ready packages must not set publish = false`,
        );
        assert.match(
          manifest,
          new RegExp(String.raw`^\[lib\]\s*\nname = "${repo.libName}"`, "m"),
          `${repo.packageName}: expected stable Rust lib import name ${repo.libName}`,
        );
        // oxlint-disable-next-line eslint/no-await-in-loop
        const status = await cratesIoStatus(repo.packageName);
        assert.ok(
          status === 200 || status === 404,
          `${repo.packageName}: unexpected crates.io status ${status}`,
        );
        runCargo(checkoutPath, ["publish", "--dry-run"]);
        process.stdout.write(
          `validated publish-ready split crate: package=${repo.packageName} cratesIoStatus=${status}\n\n`,
        );
      } else {
        assert.match(
          manifest,
          /^publish\s*=\s*false$/m,
          `${repo.packageName}: blocked packages must keep publish = false`,
        );
        for (const packageAlias of repo.expectedPackageAliases) {
          assert.match(
            manifest,
            new RegExp(String.raw`package = "${packageAlias}"`),
            `${repo.packageName}: expected dependency package alias ${packageAlias}`,
          );
        }
        process.stdout.write(`validated blocked split crate: package=${repo.packageName}\n\n`);
      }
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
