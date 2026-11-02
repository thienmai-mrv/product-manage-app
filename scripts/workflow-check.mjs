#!/usr/bin/env node
// Usage:
 //   node scripts/workflow-check.mjs verify <change> <stage>
 //   node scripts/workflow-check.mjs ready  <change> <stage>
 // Memory bootstrap:
 //   node scripts/workflow-check.mjs verify memory memory-init
 //   node scripts/workflow-check.mjs ready  memory memory-init
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const FEATURE_STAGES = ["analyst", "architect", "developer", "qa", "reviewer", "memory-update"];
const STAGES = ["memory-init", ...FEATURE_STAGES];
const GATE_AFTER_STAGE = {
  analyst: "G1",
  architect: "G2",
  developer: "G3",
  qa: "G4",
};
const PROTECTED_BRANCHES = ["main", "master"];
const CORE_MEMORY_FILES = [
  "project-overview.md",
  "architecture.md",
  "domain-model.md",
  "tech-stack.md",
  "conventions.md",
  "runtime-parity.md",
  "security.md",
  "testing.md",
  "glossary.md",
  "known-issues.md",
  "INDEX.md",
  "STATUS.md",
];

const [mode, change, stage] = process.argv.slice(2);
const isMemoryBootstrap = change === "memory" && stage === "memory-init";

if (
  !["verify", "ready"].includes(mode) ||
  !/^(memory|[a-z0-9]+(-[a-z0-9]+)*)$/.test(change ?? "") ||
  !STAGES.includes(stage) ||
  (stage === "memory-init" && change !== "memory") ||
  (change === "memory" && stage !== "memory-init")
) {
  console.error(
    "Usage:\n" +
      "  node scripts/workflow-check.mjs <verify|ready> <change> <analyst|architect|developer|qa|reviewer|memory-update>\n" +
      "  node scripts/workflow-check.mjs <verify|ready> memory memory-init",
  );
  process.exit(2);
}

const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${message}`);
  if (!ok) failures.push(message);
  return ok;
};

const run = (command, args) => spawnSync(command, args, { shell: true, stdio: "inherit" }).status === 0;
const read = (path) => (existsSync(path) ? readFileSync(path, "utf8") : "");

function statusField(label) {
  const match = read(join(".ai", "memory", "STATUS.md")).match(
    new RegExp(`^\\*{0,2}${label}:\\*{0,2}\\s*(.+)$`, "im"),
  );
  return match ? match[1].trim() : null;
}

function latestGateDecision(filePath, gate) {
  let decision = null;
  for (const line of read(filePath).split(/\r?\n/)) {
    const cells = line.split("|").map((cell) => cell.trim());
    if (cells[1] === gate) decision = cells[3]?.toLowerCase() ?? null;
  }
  return decision;
}

function field(text, label) {
  const match = text.match(new RegExp(`^\\*{0,2}${label}:\\*{0,2}\\s*(.+)$`, "im"));
  return match ? match[1].trim() : null;
}

function findChangeDir() {
  const active = join("openspec", "changes", change);
  if (existsSync(active)) return { dir: active, archived: false };
  const archiveRoot = join("openspec", "changes", "archive");
  const pattern = new RegExp(`^\\d{4}-\\d{2}-\\d{2}-${change}$`);
  const match = existsSync(archiveRoot)
    ? readdirSync(archiveRoot)
        .filter((name) => pattern.test(name))
        .sort()
        .at(-1)
    : undefined;
  return match ? { dir: join(archiveRoot, match), archived: true } : null;
}

function specFiles(dir) {
  const specsDir = join(dir, "specs");
  if (!existsSync(specsDir)) return [];
  return readdirSync(specsDir, { recursive: true }).filter((name) => String(name).endsWith("spec.md"));
}

function validateChange(location) {
  if (location.archived) return;
  check(run("openspec", ["validate", change, "--strict", "--no-interactive"]), `openspec validate ${change} --strict`);
}

function requireMemoryApproved() {
  const lifecycle = (statusField("Lifecycle") ?? "").toLowerCase();
  check(lifecycle === "approved", `memory STATUS lifecycle is approved (found: ${lifecycle || "none"})`);
  const decision = latestGateDecision(join(".ai", "memory", "approvals.md"), "GM0");
  check(decision === "approved", `GM0 is approved in .ai/memory/approvals.md (found: ${decision ?? "none"})`);
}

function verifyMemoryInit() {
  for (const file of CORE_MEMORY_FILES) {
    const path = join(".ai", "memory", file);
    if (!check(existsSync(path), `memory file exists: ${file}`)) continue;
    if (file === "STATUS.md" || file === "INDEX.md") continue;
    check(!/^\s*>\s*\*\*UNINITIALIZED\.\*\*/m.test(read(path)), `${file} is not UNINITIALIZED scaffold`);
  }
  check(existsSync(join(".ai", "memory", "reports", "init-report.md")), "reports/init-report.md exists");
  const lifecycle = (statusField("Lifecycle") ?? "").toLowerCase();
  check(
    ["pending-approval", "approved"].includes(lifecycle),
    `STATUS lifecycle is pending-approval or approved (found: ${lifecycle || "none"})`,
  );
}

function verifyMemoryUpdate() {
  const lifecycle = (statusField("Lifecycle") ?? "").toLowerCase();
  check(
    ["pending-approval", "approved"].includes(lifecycle),
    `memory update STATUS lifecycle pending-approval or approved (found: ${lifecycle || "none"})`,
  );
  check(existsSync(join(".ai", "memory", "reports", `update-${change}.md`)), `reports/update-${change}.md exists`);
  check(existsSync(join(".ai", "memory", "changelog", `${change}.md`)), `changelog/${change}.md exists`);
}

const verifiers = {
  "memory-init": verifyMemoryInit,
  analyst(location) {
    check(existsSync(join(location.dir, "proposal.md")), "proposal.md exists");
    check(specFiles(location.dir).length > 0, "at least one specs/<capability>/spec.md exists");
    validateChange(location);
  },
  architect(location) {
    check(existsSync(join(location.dir, "design.md")), "design.md exists");
    const tasks = read(join(location.dir, "tasks.md"));
    check(/^\s*- \[[ x]\] /m.test(tasks), "tasks.md exists and contains checkbox tasks");
    validateChange(location);
  },
  developer(location) {
    const tasks = read(join(location.dir, "tasks.md"));
    check(tasks !== "" && !/^\s*- \[ \] /m.test(tasks), "every task in tasks.md is checked");
    check(existsSync(join(location.dir, "reports", "development-report.md")), "reports/development-report.md exists");
    check(run("npm", ["test"]), "npm test passes");
  },
  qa(location) {
    const report = read(join(location.dir, "reports", "test-report.md"));
    check(report !== "", "reports/test-report.md exists");
    const recommendation = field(report, "Overall recommendation");
    check(/^PASS$/i.test(recommendation ?? ""), `test report recommendation is PASS (found: ${recommendation ?? "none"})`);
  },
  reviewer(location) {
    const report = read(join(location.dir, "reports", "review-report.md"));
    check(report !== "", "reports/review-report.md exists");
    const decision = field(report, "Decision");
    check(/^APPROVED$/i.test(decision ?? ""), `review decision is APPROVED (found: ${decision ?? "none"})`);
    check(/https?:\/\/\S+/.test(field(report, "Pull request") ?? ""), "review report records the pull request URL");
    check(location.archived, "change is archived and main specs are synced");
    check(run("openspec", ["validate", "--specs", "--strict", "--no-interactive"]), "openspec validate --specs --strict");
  },
  "memory-update": verifyMemoryUpdate,
};

const branch = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).stdout.trim();
if (isMemoryBootstrap) {
  check(branch !== "", `git branch detected (found: ${branch || "unknown"})`);
} else {
  check(branch !== "" && !PROTECTED_BRANCHES.includes(branch), `running on a feature branch (found: ${branch || "unknown"})`);
}

if (isMemoryBootstrap) {
  check(existsSync(join(".ai", "memory", "approvals.md")), ".ai/memory/approvals.md exists");
  if (mode === "verify") verifiers["memory-init"]();
  else check(existsSync(join(".ai", "memory", "_templates")), ".ai/memory/_templates exists");
} else {
  console.log("\n-- memory baseline");
  requireMemoryApproved();

  const location = findChangeDir();
  if (check(location !== null, `OpenSpec change "${change}" exists`)) {
    check(existsSync(join(location.dir, "approvals.md")), "feature approvals.md exists");

    if (mode === "verify") {
      verifiers[stage](location);
    } else {
      for (const previous of FEATURE_STAGES.slice(0, FEATURE_STAGES.indexOf(stage))) {
        console.log(`\n-- ${previous} outputs`);
        verifiers[previous](location);
        const gate = GATE_AFTER_STAGE[previous];
        if (gate) {
          const decision = latestGateDecision(join(location.dir, "approvals.md"), gate);
          check(decision === "approved", `${gate} is approved in approvals.md (found: ${decision ?? "none"})`);
        }
      }
    }
  }
}

console.log(failures.length ? `\n${mode} ${stage}: BLOCKED (${failures.length} failed)` : `\n${mode} ${stage}: OK`);
process.exit(failures.length ? 1 : 0);
