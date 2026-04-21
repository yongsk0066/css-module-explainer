import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

type Fixture = {
  readonly label: string;
  readonly manifestPath: string;
  readonly dependencyName: string;
};

const repoRoot = process.cwd();
const fixtures: readonly Fixture[] = [
  {
    label: "engine-input-producers",
    manifestPath: path.join(
      repoRoot,
      "rust/external-consumers/engine-input-producers-git-consumer/Cargo.toml",
    ),
    dependencyName: "engine-input-producers",
  },
  {
    label: "engine-style-parser",
    manifestPath: path.join(
      repoRoot,
      "rust/external-consumers/engine-style-parser-git-consumer/Cargo.toml",
    ),
    dependencyName: "engine-style-parser",
  },
] as const;

const checkOnly = process.argv.includes("--check");

function parseDependency(manifest: string, dependencyName: string) {
  const pattern = new RegExp(`^${dependencyName} = \\{ git = "([^"]+)", rev = "([^"]+)" \\}$`, "m");
  const match = manifest.match(pattern);
  if (!match) {
    throw new Error(`missing pinned git dependency for ${dependencyName}`);
  }
  return {
    pattern,
    repoUrl: match[1],
    rev: match[2],
  };
}

function resolveMainSha(repoUrl: string) {
  const output = execFileSync("git", ["ls-remote", repoUrl, "refs/heads/main"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  const [sha] = output.split(/\s+/, 1);
  if (!sha) {
    throw new Error(`unable to resolve main SHA for ${repoUrl}`);
  }
  return sha;
}

let changed = false;

for (const fixture of fixtures) {
  const manifest = readFileSync(fixture.manifestPath, "utf8");
  const dependency = parseDependency(manifest, fixture.dependencyName);
  const mainSha = resolveMainSha(dependency.repoUrl);
  const shortSha = mainSha.slice(0, 7);

  if (dependency.rev === shortSha) {
    process.stdout.write(`${fixture.label}: already pinned to ${shortSha}\n`);
    continue;
  }

  if (checkOnly) {
    process.stderr.write(
      `${fixture.label}: pinned ${dependency.rev} but remote main is ${shortSha}\n`,
    );
    process.exitCode = 1;
    continue;
  }

  const nextManifest = manifest.replace(
    dependency.pattern,
    `${fixture.dependencyName} = { git = "${dependency.repoUrl}", rev = "${shortSha}" }`,
  );
  writeFileSync(fixture.manifestPath, nextManifest);
  execFileSync("cargo", ["generate-lockfile", "--manifest-path", fixture.manifestPath], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  changed = true;
  process.stdout.write(`${fixture.label}: updated ${dependency.rev} -> ${shortSha}\n`);
}

if (checkOnly && process.exitCode === 1) {
  process.stderr.write("rust split consumer pins are out of date\n");
} else if (!checkOnly && !changed) {
  process.stdout.write("rust split consumer pins already up to date\n");
}
