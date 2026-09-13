# ResonantCortex2 V1 Computation Autopsy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Diagnose where compressed execution leaves successful searched trajectories, then test whether successor-consistent routing improves autonomous held-out execution without altering V0 Gates 0–5.

**Architecture:** Add a pure diagnostic module that replays frozen modes against successful traces under teacher-state, fixed-route, free-route, and oracle-existing-mode conditions. Add a separate successor graph/router learned only from successful searched traces, integrate both into the deterministic experiment receipt, then expose V1 diagnostics in the existing static Pages UI.

**Tech Stack:** Browser JavaScript ES modules, Node.js 20+, HTML/CSS Canvas, GitHub Actions, GitHub Pages. No npm packages or runtime external dependencies.

**Spec:** `docs/superpowers/specs/2026-09-13-computation-autopsy-successor-routing-design.md`

## Global Constraints

- Existing Gates 0–5 and their thresholds remain unchanged.
- Search still receives final task score only; no reference intermediate state enters search or compression.
- Reference next states may be used only after the mode bank is frozen inside Gate 6 diagnostics.
- Successor graph uses only successful searched traces and never solver identity as a routing feature.
- Oracle-best mode is diagnostic only and may not influence successor graph fitting or held-out routing.
- V0 source-only top-1 routing remains an unchanged baseline.
- All stochastic behavior remains explicitly seeded; no `Math.random()` in experiment code.
- Receipt schema increments from 1 to 2.

---

### Task 1: Preserve Search Instances and Build Computation Autopsy

**Files:**
- Modify: `src/search.js`
- Create: `src/autopsy.js`
- Modify: `tests/run-tests.mjs`

**Interfaces:**
- Search traces become `{solver, taskId, score, instance, states}` where `instance` is the JSON-serializable original task instance.
- Produce `ENDOGENOUS_DIMS`.
- Produce `assignTeacherRoute(modes, states) -> Array<{modeId,residual}|null>`.
- Produce `autopsyTrace({taskId, trace, modes, globalMode}) -> {teacherOneStep, fixedReplay, freeReplay, oracleOneStep, oracleReplay}`.
- Produce `summarizeAutopsy(taskId, traceReports) -> {eligibleTransitions, teacherOneStepEndogenous, horizons, dominantFailure}`.

- [ ] **Step 1: Add failing trace-instance and autopsy tests**

Append tests that assert successful search traces retain their input instance, then test a synthetic two-mode recurrent trace:

```js
import { autopsyTrace, summarizeAutopsy, ENDOGENOUS_DIMS } from '../src/autopsy.js';

const sr=searchEvolution({taskId:'parity',seed:51,budget:24,instances:5,programSteps:2});
assert.ok(sr.bestTraces.every(t=>t.instance && t.instance.taskId==='parity'));
assert.deepEqual(ENDOGENOUS_DIMS.mandelbrot,[0,1,5,6]);

const modeA={id:0,A:[[1,0],[0,1]],b:[1,0],prototype:[0,0],scale:[2,1],threshold:3};
const modeB={id:1,A:[[1,0],[0,1]],b:[0,0],prototype:[3,0],scale:[2,1],threshold:3};
const synthetic={taskId:'gcd',solver:'evolution',score:1,instance:{taskId:'gcd',a:10,b:5,truth:5},states:[[0,0],[1,0],[2,0],[3,0],[4,0]]};
const a=autopsyTrace({taskId:'gcd',trace:synthetic,modes:[modeA,modeB],globalMode:modeA,applyEnvironmentFn:(id,inst,s)=>s});
assert.equal(a.teacherOneStep.steps.length,4);
assert.equal(a.fixedReplay.steps.length,4);
assert.equal(a.oracleOneStep.steps.length,4);
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node tests/run-tests.mjs`

Expected: failure because trace instances and `src/autopsy.js` do not exist.

- [ ] **Step 3: Store original instance on every searched trace**

Change `tracesFrom()` in `src/search.js` to return:

```js
return {solver,taskId,score:r.score,instance:JSON.parse(JSON.stringify(inst)),states:r.trace.map(s=>s.slice())};
```

No reference next-state helper is added.

- [ ] **Step 4: Implement task endogenous dimensions and normalized errors**

In `src/autopsy.js` define exactly:

```js
export const ENDOGENOUS_DIMS={
  mandelbrot:[0,1,5,6],
  gcd:[2,3,4,6],
  sort4:[4,5,6,7],
  parity:[1,5,6]
};
```

Implement `stateError(taskId,pred,truth,dims)` as RMS coordinate error divided by `TASKS[taskId].safety`.

- [ ] **Step 5: Implement teacher-state, fixed replay, free replay, and oracle-existing-mode diagnostics**

For every true transition `s_t -> s_{t+1}`:

- teacher-state uses `routeMode(modes,s_t)` and applies the chosen affine map then the environment once,
- fixed replay records teacher-state mode IDs then replays those IDs from only `s_0`,
- free replay uses the normal `executeModes` source-only router,
- oracle one-step chooses only among the existing frozen modes by minimum endogenous next-state error on the true `s_t`,
- oracle replay replays that oracle mode sequence from only `s_0`.

Every step record contains `{step,modeId,allError,endogenousError,manifoldRatio,unknown}` where `manifoldRatio=min_i R_i(state)/theta_i`.

- [ ] **Step 6: Implement horizon aggregation and fixed failure classification**

Aggregate horizons `[1,2,4,8,16,32]` when supported. Classification rules:

```text
operator_vocabulary: oracle one-step endogenous error > 0.10
routing:             oracle <= 0.10 AND fixed replay horizon-4 <= 2x teacher error AND free horizon-4 > 2x teacher error
accumulation:        oracle <= 0.10 AND fixed replay horizon-4 > 2x teacher error
mixed:               all other eligible cases
```

Gate-6 eligibility requires at least 8 true transitions.

- [ ] **Step 7: Run tests and verify GREEN**

Run: `node tests/run-tests.mjs`

Expected: prior tests plus autopsy tests pass.

---

### Task 2: Learn Successor Graph and Add One-Step Lookahead Router

**Files:**
- Create: `src/successor.js`
- Modify: `src/executor.js`
- Modify: `tests/run-tests.mjs`

**Interfaces:**
- Produce `buildSuccessorGraph(modes,traces,{alpha=0.5}) -> {counts,probs,support,edges}`.
- Produce `routeModeSuccessor({modes,state,taskId,instance,step,successorGraph,disabledIds,lambda=0.75,eta=0.10})`.
- Extend `executeModes()` with `routing:'successor'` and optional `successorGraph`.

- [ ] **Step 1: Add failing successor graph/router tests**

Use two hand-built modes and traces whose teacher-state route is repeatedly `M0 -> M1`. Assert the graph has higher `P(1|0)` than alternatives and that lookahead selects a candidate whose predicted state lands in M1's applicability region.

```js
import { buildSuccessorGraph, routeModeSuccessor } from '../src/successor.js';
const graph=buildSuccessorGraph([m0,m1],[traceA,traceB]);
assert.ok(graph.probs['0']['1'] > graph.probs['0']['0']);
const pick=routeModeSuccessor({modes:[m0,m1],state:[0,0],taskId:'gcd',instance:traceA.instance,step:0,successorGraph:graph,applyEnvironmentFn:(id,inst,s)=>s});
assert.equal(pick.mode.id,0);
assert.equal(pick.expectedSuccessorId,1);
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node tests/run-tests.mjs`

Expected: missing `src/successor.js` / routing mode.

- [ ] **Step 3: Implement successor graph from successful searched traces only**

For each true state, assign the nearest source mode by normalized source residual. Count adjacent assigned IDs. Convert counts to Laplace-smoothed probabilities with `alpha=0.5`; store compact sorted `edges` containing `{from,to,count,prob}`.

- [ ] **Step 4: Implement continuation-cost router**

For every candidate current mode with `R_i(s) <= 1.25*theta_i`:

1. predict `A_i s+b_i`,
2. apply environment once,
3. if predicted state is terminal, use destination/prior cost zero,
4. otherwise find successor `j` minimizing destination normalized residual among modes with `R_j <= 1.50*theta_j`,
5. compute `cost=sourceCost + 0.75*destCost + 0.10*(-log(P(j|i)+1e-12))`.

Return the lowest-cost candidate with `expectedSuccessorId`, `sourceCost`, `destCost`, `prior`, and `continuationCost`; return `null` if no candidate has a viable continuation.

- [ ] **Step 5: Add `routing:'successor'` to the executor without changing existing routes**

Existing `'routed'`, `'global'`, and `'random'` behavior stays byte-for-byte semantically unchanged. Successor route records include the continuation diagnostics.

- [ ] **Step 6: Run tests and verify GREEN**

Run: `node tests/run-tests.mjs`

Expected: successor graph/router tests and all V0 tests pass.

---

### Task 3: Integrate Gate 6 and Gate 7 into Experiment and Receipt

**Files:**
- Modify: `src/metrics.js`
- Modify: `src/experiment.js`
- Modify: `scripts/run-default.mjs`
- Modify: `results/default.json`
- Modify: `tests/run-tests.mjs`

**Interfaces:**
- Each task adds `autopsy`, `successorGraph`, and `successorExecution`.
- `evaluateGates(report)` retains Gate 0–5 logic and appends Gate 6–7.
- Receipt schema becomes `2`.

- [ ] **Step 1: Add failing Gate 6/7 boundary tests**

Extend the synthetic report with:

```js
autopsy:{eligibleTransitions:20,teacherOneStepEndogenous:0.04,horizons:{4:{fixedEndogenous:0.14,freeEndogenous:0.20,oracleEndogenous:0.05,unknownRate:0.25}},dominantFailure:'accumulation'},
successorExecution:{score:0.82,sourceOnlyScore:0.68,globalScore:0.65,unknownRate:0.10,sourceOnlyUnknownRate:0.20,horizon8Endogenous:0.12,sourceOnlyHorizon8Endogenous:0.20}
```

Assert Gate 6 and 7 pass, then move teacher error to `0.11` for Gate 6 failure and successor score gain to `<0.10` for Gate 7 failure.

- [ ] **Step 2: Run tests and verify RED**

Run: `node tests/run-tests.mjs`

Expected: Gate 6/7 missing.

- [ ] **Step 3: Build autopsy and successor graph after compression freezes**

In `runExperiment`, retain the pooled successful traces, call `summarizeAutopsy` on per-trace reports, then build the successor graph. No autopsy-derived information is allowed to change the modes.

- [ ] **Step 4: Evaluate successor routing on the existing held-out instances**

Add discrete and Mandelbrot successor-routing evaluation using the same held-out instances already used by source-only/global/neural execution. Record score, exact/correlation/MAE as appropriate, operation count, UNKNOWN rate, sample route, and horizon-8 endogenous error when an aligned searched trace is available for diagnosis.

- [ ] **Step 5: Implement Gate 6 and Gate 7 exactly from the design spec**

Gate 6 passes when at least one eligible task has `teacherOneStepEndogenous <= 0.10` and horizon-4 `fixedEndogenous` or `freeEndogenous` at least `2x` teacher error.

Gate 7 passes when at least one task has successor score gain `>=0.10`, satisfies the global-baseline guard, and improves UNKNOWN rate or horizon-8 endogenous error by at least 20%.

- [ ] **Step 6: Increment receipt schema and regenerate bounded receipt**

Set `engineering.version=2` and `receiptSchemaVersion=2`. Run:

```bash
node scripts/run-default.mjs
node tests/run-tests.mjs
```

Scientific failures are recorded rather than asserted green.

- [ ] **Step 7: Verify deterministic receipt**

Run the default receipt generator twice and compare parsed JSON deeply in Node. Expected: identical parsed objects.

---

### Task 4: Expose the Autopsy and Successor Circuit in GitHub Pages

**Files:**
- Modify: `index.html`
- Modify: `src/ui.js`
- Modify: `README.md`
- Modify: `tests/run-tests.mjs`

**Interfaces:**
- Add UI IDs: `autopsy-table`, `autopsy-summary`, `successor-edges`, `successor-score`, `successor-route`.

- [ ] **Step 1: Add failing UI integrity tests**

Extend the existing HTML-ID list with the five V1 IDs and assert the committed receipt schema is `2` with Gates 6 and 7 present.

- [ ] **Step 2: Run tests and verify RED**

Run: `node tests/run-tests.mjs`

Expected: missing V1 UI IDs / receipt fields.

- [ ] **Step 3: Add Computation Autopsy panel**

Render the selected task's dominant failure classification, teacher one-step endogenous error, and horizon rows `1,2,4,8,16,32` with fixed-route, free-route, oracle-replay endogenous error, manifold survival, and UNKNOWN rate.

- [ ] **Step 4: Add Successor Routing panel**

Render source-only score vs successor score vs global score, compact top successor edges as `M0 -> M1 0.73`, and the selected successor route with expected successor IDs and continuation costs.

- [ ] **Step 5: Update README with the measured V1 receipt only**

Do not describe Gate 6/7 as successful until the regenerated receipt says so. Preserve V0 findings and add the V1 diagnosis/result beneath them.

- [ ] **Step 6: Run the complete verification suite**

Run:

```bash
node scripts/run-default.mjs
node tests/run-tests.mjs
```

Expected: engineering tests pass; science may PASS or FAIL independently.
