/**
 * Merges unit-test coverage (coverage/coverage-final.json) with integration-test
 * coverage (coverage-integration/coverage-final.json) using istanbul-lib-coverage,
 * then enforces an 80% lines threshold on the combined result.
 *
 * Exits 0 if combined lines coverage >= 80%.
 * Exits 1 otherwise (CI failure).
 *
 * Usage:
 *   node scripts/merge-coverage.mjs
 */

import { readFileSync, existsSync } from 'fs';
// Bare specifier so Node resolves it via the node_modules walk — istanbul-lib-coverage
// is a transitive dep that npm workspaces hoists to the ROOT node_modules, not
// backend/node_modules. A hardcoded '../node_modules/...' path breaks under hoisting
// (and identically in CI, which installs from the same lockfile).
import pkg from 'istanbul-lib-coverage';
const { createCoverageMap } = pkg;

const LINES_THRESHOLD = 80;

function loadCoverageMap(jsonPath) {
  if (!existsSync(jsonPath)) {
    console.error(`Coverage file not found: ${jsonPath}`);
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(jsonPath, 'utf8'));
  return createCoverageMap(raw);
}

// Load unit + integration coverage maps
const unitMap = loadCoverageMap('coverage/coverage-final.json');
const integrationMap = loadCoverageMap('coverage-integration/coverage-final.json');

// Merge: integration into unit (unit map is the base)
unitMap.merge(integrationMap);

// Compute summary from merged map
const summary = unitMap.getCoverageSummary();

const linesTotal = summary.lines.total;
const linesCovered = summary.lines.covered;
const linesPct = linesTotal > 0 ? (linesCovered / linesTotal) * 100 : 0;

const stmtsTotal = summary.statements.total;
const stmtsCovered = summary.statements.covered;
const stmtsPct = stmtsTotal > 0 ? (stmtsCovered / stmtsTotal) * 100 : 0;

const branchTotal = summary.branches.total;
const branchCovered = summary.branches.covered;
const branchPct = branchTotal > 0 ? (branchCovered / branchTotal) * 100 : 0;

const funcTotal = summary.functions.total;
const funcCovered = summary.functions.covered;
const funcPct = funcTotal > 0 ? (funcCovered / funcTotal) * 100 : 0;

console.log('\n=============================== Combined Coverage Summary ================================');
console.log(`Statements   : ${stmtsPct.toFixed(2)}% ( ${stmtsCovered}/${stmtsTotal} )`);
console.log(`Branches     : ${branchPct.toFixed(2)}% ( ${branchCovered}/${branchTotal} )`);
console.log(`Functions    : ${funcPct.toFixed(2)}% ( ${funcCovered}/${funcTotal} )`);
console.log(`Lines        : ${linesPct.toFixed(2)}% ( ${linesCovered}/${linesTotal} )`);
console.log('==========================================================================================\n');

if (linesPct < LINES_THRESHOLD) {
  console.error(
    `ERROR: Combined lines coverage (${linesPct.toFixed(2)}%) does not meet global threshold (${LINES_THRESHOLD}%).`
  );
  process.exit(1);
}

console.log(
  `PASS: Combined lines coverage (${linesPct.toFixed(2)}%) meets the ${LINES_THRESHOLD}% threshold.`
);
process.exit(0);
