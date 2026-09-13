# ResonantCortex2 Algorithm Search Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic static GitHub Pages lab that searches numerical recurrent programs from final task score, compresses successful traces into routed local affine modes, executes the frozen mode bank on unseen instances, and interprets discovered modes after the fact.

**Architecture:** Pure ES modules implement four task contracts, a generic gated affine microcircuit representation, evolutionary and simulated-annealing search, deterministic transition compression, hard top-1 routing, baselines, gate metrics, and post-hoc interpretation. `index.html` plus `src/ui.js` render the browser laboratory. Node runs the same modules for deterministic tests and the default receipt.

**Tech Stack:** Browser JavaScript ES modules, Node.js 20+, HTML/CSS Canvas, GitHub Actions, GitHub Pages. No npm packages and no runtime external dependencies.

**Spec:** `docs/superpowers/specs/2026-09-13-algorithm-search-lab-design.md`

## Global Constraints

- Search receives only `initial state + generic transform vocabulary + final score`; it never receives reference intermediate states.
- State dimension is at most 16 scalars per task.
- Compressed mode bank is at most 12 modes.
- Search generators are evolutionary mutation/selection and simulated annealing/stochastic local search over the same representation.
- Default search budget is 4,000 candidate evaluations per generator per task.
- Execution routing is hard top-1 and emits `UNKNOWN` if no learned applicability gate passes threshold.
- Scientific gate failures are data, not CI failures.
- Pages remains static and dependency-free.
- All random behavior is driven by explicit seeded PRNG objects; no `Math.random()` in experiment code.

---

### Task 1: Deterministic Core and Task Contracts

**Files:**
- Create: `src/prng.js`
- Create: `src/tasks.js`
- Create: `tests/run-tests.mjs`

**Interfaces:**
- Produces: `makeRng(seed)`, `randn(rng)`, `shuffle(rng, xs)`.
- Produces: `TASKS`, `makeInstance(taskId, rng, split)`, `initialState(taskId, instance)`, `scoreState(taskId, instance, state)`, `isTerminal(taskId, instance, state, step)`, `readAnswer(taskId, instance, state)`, `referenceScore(taskId, instance, state)`.
- Task states are plain numeric arrays of length `<=16`; task instances are JSON-serializable objects.

- [ ] **Step 1: Write deterministic PRNG/task tests**

Add assertions to `tests/run-tests.mjs`:

```js
import assert from 'node:assert/strict';
import { makeRng } from '../src/prng.js';
import { TASKS, makeInstance, initialState } from '../src/tasks.js';

const a = makeRng(17), b = makeRng(17);
assert.deepEqual(Array.from({length: 8}, () => a()), Array.from({length: 8}, () => b()));
for (const id of Object.keys(TASKS)) {
  const rng = makeRng(100 + id.length);
  const inst = makeInstance(id, rng, 'search');
  const state = initialState(id, inst);
  assert.ok(state.length <= 16, `${id}: state too large`);
  assert.ok(state.every(Number.isFinite), `${id}: non-finite initial state`);
}
```

- [ ] **Step 2: Run test and verify failure**

Run: `node tests/run-tests.mjs`

Expected: module-not-found for `src/prng.js` or `src/tasks.js`.

- [ ] **Step 3: Implement seeded PRNG**

Implement Mulberry32 and Box-Muller without ambient randomness:

```js
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

Also export `randn`, integer sampling, and deterministic shuffle.

- [ ] **Step 4: Implement four task contracts**

Use these fixed-width states:

```text
mandelbrot: [zr, zi, cr, ci, step, alive, out0, out1]
gcd:        [a, b, work0, work1, step, done, out, spare]
sort4:      [x0, x1, x2, x3, pc, step, done, spare]
parity:     [bit0..bit7 window/summary slots, index, accumulator, length, step, done]
```

The benchmark functions may calculate final truth for scoring, but no function that returns a reference next state is exported.

- [ ] **Step 5: Re-run deterministic tests**

Run: `node tests/run-tests.mjs`

Expected: PASS for determinism and task-state invariants.

- [ ] **Step 6: Commit**

```bash
git add src/prng.js src/tasks.js tests/run-tests.mjs
git commit -m "feat: add deterministic task contracts"
```

---

### Task 2: Generic Microcircuit Representation and Two Search Engines

**Files:**
- Create: `src/operators.js`
- Create: `src/search.js`
- Modify: `tests/run-tests.mjs`

**Interfaces:**
- Consumes: task contracts and PRNG from Task 1.
- Produces: `randomProgram(dim, rng, steps)`, `mutateProgram(program, rng, sigma)`, `runProgram(program, taskId, instance, maxSteps)`, `programParameterCount(program)`.
- Produces: `searchEvolution(opts)` and `searchAnneal(opts)` returning `{ bestProgram, bestScore, evaluations, successfulTraces }`.
- A program step is `{A:number[][], b:number[], u:number[], c:number, k:number}` implementing `h=A*s+b`, `g=sigmoid(k*(u·s+c))`, `s'=s+g*h`.

- [ ] **Step 1: Add operator/search tests**

```js
import { randomProgram, runProgram } from '../src/operators.js';
import { searchEvolution, searchAnneal } from '../src/search.js';

const rng = makeRng(91);
const p = randomProgram(8, rng, 3);
assert.equal(runProgram(p, 'gcd', makeInstance('gcd', makeRng(2), 'search'), 12).trace.length <= 13, true);
for (const search of [searchEvolution, searchAnneal]) {
  const r1 = search({taskId:'parity', seed:44, budget:40, instances:8});
  const r2 = search({taskId:'parity', seed:44, budget:40, instances:8});
  assert.deepEqual(r1.bestScore, r2.bestScore);
  assert.equal(r1.evaluations, 40);
}
```

- [ ] **Step 2: Verify test failure**

Run: `node tests/run-tests.mjs`

Expected: missing operator/search exports.

- [ ] **Step 3: Implement numerical program representation**

Use only generic coefficient arrays; do not add task-specific opcodes. Clamp state values to task-specific numeric safety bounds after each step to avoid non-finite search trajectories.

- [ ] **Step 4: Implement evolutionary search**

Use a small deterministic population, elite retention, Gaussian mutation, and exact evaluation accounting. Fitness is average final task score across search instances plus a tiny complexity penalty (`1e-5 * parameterCount`) only as a tie-breaker.

- [ ] **Step 5: Implement simulated annealing**

Mutate the same program object, accept improvements or `exp((new-old)/T)`, cool deterministically from `T=0.25` to `0.01`, and preserve the best-so-far trace set.

- [ ] **Step 6: Re-run tests**

Run: `node tests/run-tests.mjs`

Expected: both search engines deterministic and evaluation counts exact.

- [ ] **Step 7: Commit**

```bash
git add src/operators.js src/search.js tests/run-tests.mjs
git commit -m "feat: add generic microcircuit search"
```

---

### Task 3: Transition Compression and Routed Executor

**Files:**
- Create: `src/compress.js`
- Create: `src/executor.js`
- Modify: `tests/run-tests.mjs`

**Interfaces:**
- Consumes: `successfulTraces` records shaped `{solver, taskId, score, states:number[][]}`.
- Produces: `fitGlobalOperator(transitions) -> mode`.
- Produces: `compressTransitions(transitions, {maxModes, validationFraction, seed}) -> {modes, globalMode, assignments, validation}`.
- Mode shape: `{id, prototype, scale, A, b, threshold, trainSolvers}`.
- Produces: `routeMode(modes, state, disabledIds=[]) -> {mode, residual, gate}|null` and `executeModes({taskId, instance, modes, maxSteps, disabledIds, routing})`.

- [ ] **Step 1: Add synthetic compression tests**

Construct two piecewise affine transition families where one global map is provably worse:

```js
const transitions = [];
for (let i=0;i<80;i++) {
  const x = i/20 - 2;
  const s = [x, 1];
  const next = x < 0 ? [x + 1, 1] : [2*x, 1];
  transitions.push({state:s,next,solver:i%2?'evolution':'anneal'});
}
const comp = compressTransitions(transitions,{maxModes:4,validationFraction:.25,seed:5});
assert.ok(comp.modes.length >= 2);
assert.ok(comp.validation.nmseModes < comp.validation.nmseGlobal);
```

Also verify `UNKNOWN` when a distant state is presented.

- [ ] **Step 2: Verify failure**

Run: `node tests/run-tests.mjs`

Expected: missing compression/executor modules.

- [ ] **Step 3: Implement affine least-squares fitting**

Implement small-matrix ridge regression with deterministic Gaussian elimination in plain JS. Fit `next = A*state+b`; compute normalized MSE with `1e-12` stabilizer.

- [ ] **Step 4: Implement deterministic greedy split/merge compression**

Start with one global cluster. Repeatedly split the cluster with highest validation residual by source-state residual direction / deterministic 2-means seed until no split improves validation NMSE by at least 2% or `maxModes=12`. Refit each cluster after a split.

- [ ] **Step 5: Fit applicability models**

For each mode store source-state centroid `prototype`, per-coordinate scale with a floor, and threshold set to the 95th percentile normalized source distance. Runtime residual is computable from source state only.

- [ ] **Step 6: Implement hard routed recurrence**

Choose the mode with minimum normalized source residual if within its threshold; otherwise emit `UNKNOWN`. Record `{modeId,residual}` per step. Support routing-disabled global mode and random-mode ablation.

- [ ] **Step 7: Re-run tests**

Run: `node tests/run-tests.mjs`

Expected: synthetic piecewise case beats global fit and OOD state returns `UNKNOWN`.

- [ ] **Step 8: Commit**

```bash
git add src/compress.js src/executor.js tests/run-tests.mjs
git commit -m "feat: compress traces into routed modes"
```

---

### Task 4: Metrics, Scientific Gates, Baselines, and Interpreter

**Files:**
- Create: `src/metrics.js`
- Create: `src/interpreter.js`
- Modify: `tests/run-tests.mjs`

**Interfaces:**
- Produces: `pearson(a,b)`, `nmse(pred,truth)`, `normalizedMae(pred,truth,max)`, `r2(pred,truth)`.
- Produces: `evaluateTaskBundle(bundle)`, `evaluateGates(report)` returning exact Gate 0–5 booleans plus evidence.
- Produces: `interpretMode(mode, probeStates)` and `ablateModeBank(...)`.
- Tiny neural baseline is implemented inside `metrics.js` as a deterministic one-hidden-layer tanh network trained from successful transitions; parameter count must be within `[0.5x,2x]` the mode bank.

- [ ] **Step 1: Add metric/gate unit tests**

```js
import { pearson, evaluateGates } from '../src/metrics.js';
assert.ok(Math.abs(pearson([1,2,3],[2,4,6]) - 1) < 1e-12);
const fake = makeSyntheticPassingReport();
assert.equal(evaluateGates(fake).gate0.pass, true);
assert.equal(evaluateGates(fake).gate5.pass, true);
```

Build `makeSyntheticPassingReport()` in the test file with values exactly above thresholds, then mutate each threshold below its boundary to confirm it fails.

- [ ] **Step 2: Verify failure**

Run: `node tests/run-tests.mjs`

Expected: missing metrics/interpreter exports.

- [ ] **Step 3: Implement exact spec thresholds**

Encode Gates 0–5 exactly as written in the design: 25% NMSE gain for 3/4 tasks; 20-point/80% execution criteria or Mandelbrot correlation/MAE; 20x search compression with >=90% score retention; routing ablation; cross-solver fidelity; interpreter surrogate R² >= .98 on >=1,000 probes.

- [ ] **Step 4: Implement tiny neural baseline**

Use seeded full-batch gradient descent on a one-hidden-layer tanh next-state model. Automatically choose hidden width so parameter count is closest to the compressed bank while staying inside the specified factor range.

- [ ] **Step 5: Implement post-hoc interpreter**

Probe frozen modes and fit/test the fixed library: identity/copy-like, coordinate permutation/swap-like, sign flip, scalar scale/rotate-like, add/subtract-like affine patterns, threshold/select, and binary toggle. Return `UNNAMED` unless independent probe R² meets the candidate's acceptance threshold.

- [ ] **Step 6: Re-run tests**

Run: `node tests/run-tests.mjs`

Expected: metric arithmetic and every gate boundary test passes.

- [ ] **Step 7: Commit**

```bash
git add src/metrics.js src/interpreter.js tests/run-tests.mjs
git commit -m "feat: add baselines gates and interpreter"
```

---

### Task 5: End-to-End Experiment Runner and Mandelbrot Integrity Control

**Files:**
- Create: `src/experiment.js`
- Create: `scripts/run-default.mjs`
- Modify: `tests/run-tests.mjs`

**Interfaces:**
- Produces: `runExperiment(config) -> report` with per-task search results, compression stats, held-out execution, baselines, ablations, cross-solver reuse, interpretations, and gates.
- Produces: `runMandelbrotImitationControl(config)` clearly separated under `report.controls.mandelbrotImitation`.
- `scripts/run-default.mjs` writes `results/default.json` using a bounded CI configuration while preserving the design's full defaults in `report.config.fullDefault`.

- [ ] **Step 1: Add end-to-end smoke test**

```js
import { runExperiment } from '../src/experiment.js';
const report = runExperiment({seed:17,budget:60,instances:8,evalScale:'smoke'});
assert.deepEqual(report.config.seed,17);
assert.deepEqual(Object.keys(report.tasks).sort(), ['gcd','mandelbrot','parity','sort4']);
for (const task of Object.values(report.tasks)) {
  assert.ok(Number.isFinite(task.search.evolution.bestScore));
  assert.ok(task.compression.modeCount <= 12);
}
assert.ok(report.gates && report.controls.mandelbrotImitation);
```

- [ ] **Step 2: Verify failure**

Run: `node tests/run-tests.mjs`

Expected: missing experiment runner.

- [ ] **Step 3: Implement split generation and trace pooling**

Use independent derived seeds for search, compression validation, and final evaluation. Pool traces from both solvers without solver labels entering compression features.

- [ ] **Step 4: Implement held-out execution and baselines**

For each task run mode-bank execution, global transform, tiny neural baseline, routing-disabled/random-mode ablations, and search-only comparison with explicit operation/evaluation counts.

- [ ] **Step 5: Implement Mandelbrot imitation control**

Fit a small regression network/operator directly to `(z,c)->z²+c` only under `controls`; render a compact escape grid and record correlation/normalized MAE. Never feed its weights or transitions into discovery.

- [ ] **Step 6: Implement default receipt script**

`node scripts/run-default.mjs` must create deterministic JSON and include `engineering.ok`, all gate evidence, seed/budget, task metrics, and the imitation-control label.

- [ ] **Step 7: Re-run smoke tests twice**

Run:

```bash
node tests/run-tests.mjs
node scripts/run-default.mjs
cp results/default.json /tmp/receipt.json
node scripts/run-default.mjs
cmp results/default.json /tmp/receipt.json
```

Expected: tests pass and receipts are byte-identical.

- [ ] **Step 8: Commit**

```bash
git add src/experiment.js scripts/run-default.mjs tests/run-tests.mjs results/default.json
git commit -m "feat: run falsifiable algorithm search experiments"
```

---

### Task 6: Static Interactive Lab UI

**Files:**
- Create: `index.html`
- Create: `src/ui.js`
- Modify: `tests/run-tests.mjs`

**Interfaces:**
- Consumes: `runExperiment` and existing result schema.
- Produces browser controls for task, seed, budget, search/compress/execute, mode inspection, route display, Mandelbrot truth/compiled canvases, baselines/ablations, and Gate 0–5 badges.

- [ ] **Step 1: Add static integrity tests**

Read `index.html` from Node and assert IDs exist: `run-search`, `compress`, `execute`, `task-select`, `mode-grid`, `route-view`, `truth-canvas`, `compiled-canvas`, `gate-grid`, `engineering-status`.

Also assert no `<script src="http` and no external stylesheet/link dependencies.

- [ ] **Step 2: Verify failure**

Run: `node tests/run-tests.mjs`

Expected: `index.html` missing.

- [ ] **Step 3: Build dependency-free lab shell**

Use responsive HTML/CSS with compact explanatory copy. Keep scientific PASS/FAIL badges visually separate from engineering status. Provide a `Run default experiment` control and staged controls that expose search → compression → execution.

- [ ] **Step 4: Render mode and route inspection**

Each mode card shows ID, source residual threshold, train solver occurrence, effective rank, top changed/preserved coordinates, candidate post-hoc name or `UNNAMED`, and ablation delta. Route view shows the selected held-out instance's mode-ID sequence and `UNKNOWN` if encountered.

- [ ] **Step 5: Render Mandelbrot comparison**

Canvas renderer shows reference escape map and compiled-discovery map side by side, with the imitation control visually separated below so it cannot be mistaken for discovery.

- [ ] **Step 6: Re-run tests**

Run: `node tests/run-tests.mjs`

Expected: PASS including static dependency/ID checks.

- [ ] **Step 7: Commit**

```bash
git add index.html src/ui.js tests/run-tests.mjs
git commit -m "feat: add algorithm search browser lab"
```

---

### Task 7: CI, README, Receipts, and Final Verification

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `README.md`
- Modify: `results/default.json`
- Modify: `tests/run-tests.mjs`
- Preserve: `.github/workflows/static.yml`

**Interfaces:**
- CI runs `node tests/run-tests.mjs` and `node scripts/run-default.mjs` on Node 20.
- README reports scientific results from the committed receipt without upgrading failed gates into claims.

- [ ] **Step 1: Add receipt-schema tests**

Require fields `engineering`, `config`, `tasks`, `baselines`, `gates`, `controls`; verify all numbers are finite and every gate has `{pass:boolean,evidence:...}`.

- [ ] **Step 2: Add GitHub Actions CI**

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: node tests/run-tests.mjs
      - run: node scripts/run-default.mjs
```

Do not fail based on Gate 0–5 booleans; fail only if the runner/tests error or receipt schema is invalid.

- [ ] **Step 3: Write README from the actual receipt**

README sections: hypothesis, no-intermediate-oracle rule, architecture, tasks, how to run, current Gate 0–5 table, Mandelbrot imitation-control warning, repository structure, interpretation rules.

- [ ] **Step 4: Full local verification**

Run:

```bash
node --check src/*.js
node tests/run-tests.mjs
node scripts/run-default.mjs
```

Expected: no syntax errors; engineering tests green; scientific gates may pass or fail and are faithfully recorded.

- [ ] **Step 5: Commit final documentation/CI**

```bash
git add .github/workflows/ci.yml README.md results/default.json tests/run-tests.mjs
git commit -m "ci: verify algorithm search lab"
```

- [ ] **Step 6: Push branch, inspect CI, and only then merge**

Confirm the CI job is green, inspect `results/default.json`, verify Pages workflow remains untouched, and merge into `main` only after the complete regression passes.
