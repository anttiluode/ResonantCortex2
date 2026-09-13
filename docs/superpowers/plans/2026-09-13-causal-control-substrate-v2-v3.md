# ResonantCortex2 V2/V3 Causal Control Substrate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fixed causal dynamical substrate whose controls are discovered by search and compressed into reusable motifs, then add a separate loop-level global-consistency diagnostic.

**Architecture:** V0/V1 remains frozen and is imported as the historical report. V2 introduces a fixed compiled graph step plus local implicit nonlinearity; evolution and annealing mutate only bounded control policies. Successful `(state,input,control)` observations are compressed into routed control motifs and executed autonomously through the same exact substrate. V3 adds closed-loop probes and a post-hoc closure monitor without changing policy behavior.

**Tech Stack:** Browser JavaScript ES modules, Node.js 20+, HTML/CSS/Canvas, GitHub Actions, GitHub Pages. No npm/runtime external dependencies.

**Spec:** `docs/superpowers/specs/2026-09-13-causal-control-substrate-global-consistency-design.md`

## Global Constraints

- Gates 0–7 and their thresholds remain semantically unchanged.
- Search receives final scalar task score only; no oracle intermediate states, reference controls, or motif assignments.
- Substrate parameters are fixed before search and are identical across all V2 primary tasks.
- Search mutates only policy parameters and never receives derivatives through the substrate.
- Compression sees only successful searched trajectories and compiles `(state,input)->control`, never `state->next state`.
- Every state transition during V2/V3 evaluation is produced by the fixed causal substrate.
- All stochastic behavior uses the seeded PRNG; no `Math.random()`.
- Receipt schema becomes 3 and retains V0/V1 report/gates.
- Engineering CI records scientific FAILs but does not fail because a science gate is red.

---

### Task 1: Fixed Causal Substrate

**Files:**
- Create: `src/causal_substrate.js`
- Modify: `tests/run-tests.mjs`

**Interfaces:**
- Produce `makeDefaultSubstrate() -> CausalSubstrate`.
- Produce `compilePassiveGraph({G,C,siteNodes,dt}) -> {P,X}`.
- Produce `stepSubstrate(substrate,state,control) -> {state,converged,iterations,residual,safetyClamped,current}`.
- Produce `serializeSubstrate(substrate) -> plain object` for integrity checks.

- [ ] **Step 1: Write failing substrate tests**

Add tests that verify: zero-control and seeded bounded-random control stay finite for 2000 steps; same input sequence replays exactly; perturbing control changes next state while serialized substrate stays deep-equal; controls are clipped to `[-1,1]`; public step API returns a new state rather than accepting a target next state.

```js
import { makeDefaultSubstrate, stepSubstrate, serializeSubstrate } from '../src/causal_substrate.js';
const cs=makeDefaultSubstrate();
const before=serializeSubstrate(cs);
let x=Array(cs.n).fill(0);
const a=stepSubstrate(cs,x,[0,0,0]);
const b=stepSubstrate(cs,x,[0.4,0,0]);
assert.notDeepEqual(a.state,b.state);
assert.deepEqual(serializeSubstrate(cs),before);
assert.ok(a.state.every(Number.isFinite));
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node tests/run-tests.mjs`

Expected: missing `src/causal_substrate.js`.

- [ ] **Step 3: Implement a small fixed graph compiler**

Use a 9-node symmetric conductance graph with fixed capacities, three fixed control sites, and backward-Euler compilation:

```text
A = diag(C/dt) + G
P = A^-1 diag(C/dt)
X = A^-1 B
```

Implement the existing repository's small Gaussian-elimination style linear solver locally so the browser build remains dependency-free.

- [ ] **Step 4: Implement fixed saturating local nonlinear closure**

Use a deterministic current law

```text
J(z,u) = gain*tanh(u + feedback*tanh(z)) - leak*z
```

and solve `z = S x_passive + R J(z,u)` with Newton iterations using analytic diagonal `dJ/dz`, maximum 12 iterations, tolerance `1e-10`, and bounded backtracking. The exact constants are fixed exports and shared by all tasks.

- [ ] **Step 5: Implement integrity diagnostics**

`stepSubstrate` clips controls, runs the implicit solve, returns convergence/residual/clamp metadata, and applies only a fixed safety clamp on state magnitude. `serializeSubstrate` exposes graph/matrices/constants but no mutator.

- [ ] **Step 6: Run tests and verify GREEN**

Run: `node tests/run-tests.mjs`

Expected: all V0/V1 tests plus substrate tests pass.

---

### Task 2: Natural Temporal Tasks and Searchable Control Policies

**Files:**
- Create: `src/control_tasks.js`
- Create: `src/control_policy.js`
- Create: `src/control_search.js`
- Modify: `tests/run-tests.mjs`

**Interfaces:**
- Produce `CONTROL_TASKS` with ids `toggle`, `delay`, `pattern`, `switch`.
- Produce `makeControlInstance(taskId,rng,split)`.
- Produce `runControlPolicy({taskId,instance,policy,substrate}) -> {score,exact,trajectory,controls,inputs,stepMeta}`.
- Produce `randomControlPolicy`, `mutateControlPolicy`, `cloneControlPolicy`, `controlPolicyParameterCount`.
- Produce `searchControlEvolution` and `searchControlAnneal` with identical policy representation and final-score-only evaluation.

- [ ] **Step 1: Write failing task/policy/search tests**

Assert deterministic instance generation; held-out toggle sequences are longer than search; held-out delay gaps are longer; the four tasks use the same substrate object structure; search replay with the same seed is identical; successful traces store state/input/control but no oracle target state.

- [ ] **Step 2: Run tests and verify RED**

Expected: missing control modules.

- [ ] **Step 3: Implement deterministic task streams**

Use one external input vector of length 3 for every task. Each episode feeds one input vector per clock step. Readout uses fixed substrate coordinates and fixed task-independent transforms; only scoring differs by task. Search split and held-out split use disjoint derived seeds and broader timing/amplitude ranges for held-out instances.

- [ ] **Step 4: Implement searchable bounded policy**

A policy contains 3 gated units. Each unit computes

```text
raw = W*x + V*input + b
g = sigmoid(k*(q*x + r*input + c))
u += g*tanh(raw)
control = tanh(u)
```

No policy parameter touches the substrate.

- [ ] **Step 5: Implement episode execution and scoring**

Every clock step computes control, calls `stepSubstrate`, and records `{state,input,control}` plus convergence metadata. Task scores are terminal-only from fixed readout coordinates. Failed substrate solve makes episode score 0.

- [ ] **Step 6: Implement evolution and annealing**

Mirror V0's deterministic search discipline. Both generators evaluate only average final task score on search instances. Return best policy, evaluations, all best traces, and traces with instance score `>=0.80`.

- [ ] **Step 7: Run tests and verify GREEN**

Run: `node tests/run-tests.mjs`.

---

### Task 3: Control Compression and Autonomous Motif Execution

**Files:**
- Create: `src/control_compress.js`
- Create: `src/control_execute.js`
- Modify: `tests/run-tests.mjs`

**Interfaces:**
- Produce `controlSamplesFromTraces(traces)` returning `{state,input,control,solver,taskId,traceScore}` samples.
- Produce `compressControls(samples,{maxMotifs,seed}) -> {motifs,globalMap,validation}`.
- Motif fields: `{id,prototype,scale,inputPrototype,inputScale,W,b,threshold,count,trainSolvers}`.
- Produce `routeControlMotif(motifs,state,input) -> {motif,residual}|null`.
- Produce `executeControlMotifs({taskId,instance,motifs,substrate})`.
- Produce required baselines: global map, nearest successful sample, zero control, random matched policy.

- [ ] **Step 1: Write failing compression tests**

Build a synthetic two-region state/input→control mapping. Assert two motifs beat one global control map on validation and reject a far-away state/input. Assert motif execution cannot set a next state directly and calls the substrate step.

- [ ] **Step 2: Run tests and verify RED**

Expected: missing control compression/execution modules.

- [ ] **Step 3: Implement affine control fitting and source geometry**

Fit `control ~= W*[state,input] + b` by ridge normal equations. Learn prototype/scale on state and input. Cluster by greedy median split only when validation control MSE improves by at least 2%, with maximum 12 motifs.

- [ ] **Step 4: Implement source routing and abstention**

Use normalized joint state/input residual. Choose minimum residual motif only if below its learned 95th-percentile threshold plus fixed margin; otherwise abstain/UNKNOWN.

- [ ] **Step 5: Implement autonomous motif execution**

At each clock, route from current exact substrate state and current external input, emit bounded control, then call the causal substrate. Record motif IDs, residuals, controls, and substrate diagnostics.

- [ ] **Step 6: Implement the four required baselines**

Global map uses one affine control decoder. Nearest-trajectory control replays the nearest successful sample's control. Zero control sends all zeros. Random matched policy uses a deterministic randomly initialized policy with parameter count within 2x the motif representation.

- [ ] **Step 7: Run tests and verify GREEN**

Run: `node tests/run-tests.mjs`.

---

### Task 4: V2 Report, Gates 8–11, and First Scientific Receipt

**Files:**
- Create: `src/v2_experiment.js`
- Modify: `src/metrics.js`
- Modify: `scripts/run-default.mjs`
- Modify: `results/default.json`
- Modify: `tests/run-tests.mjs`

**Interfaces:**
- `runV2V3Experiment(config)` imports `runExperiment(config)` for the frozen V0/V1 section and appends top-level `causalControl` and later `globalConsistency`.
- `evaluateGates(report)` retains Gates 0–7 and appends Gates 8–13 when evidence is present.
- Receipt schema becomes 3.

- [ ] **Step 1: Add Gate 8–11 boundary tests**

Construct a synthetic report at exact preregistered thresholds and verify PASS; perturb each threshold below/above boundary and verify FAIL. Assert Gates 0–7 remain identical for the original synthetic V1 report.

- [ ] **Step 2: Run tests and verify RED**

Expected: Gates 8–11 and V2 runner missing.

- [ ] **Step 3: Assemble substrate integrity evidence for Gate 8**

Run fixed seeded zero/random stress sequences, deterministic replay, control perturbation, parameter immutability, convergence rate, and direct-overwrite interface audit.

- [ ] **Step 4: Search/evaluate all four primary tasks**

For each task run evolution and annealing with the same fixed substrate, pool successful traces, compress controls only after search, then evaluate search-only, motifs, global, nearest, zero, and random baselines on held-out instances.

- [ ] **Step 5: Implement policy-horizon diagnostics for Gate 11**

On aligned successful and held-out episodes compare teacher-state motif choice versus autonomous motif rollout at horizons 1 and 8. Divergence is normalized Euclidean state difference divided by fixed substrate safety scale. Record early-abstention rate.

- [ ] **Step 6: Implement Gates 8–11 exactly**

Gate 8: all finite, convergence >=0.999, deterministic bitwise JSON replay, control perturbation effective, immutable substrate, no direct overwrite API.

Gate 9: >=3/4 primary tasks meet search score/exact/no-control/two-generator criteria.

Gate 10: >=2 primary tasks retain >=0.90 search score, beat global by required margin, zero search at inference, UNKNOWN <=0.10, and at least one uses >=2 motifs.

Gate 11: >=2 Gate-10 tasks meet horizon-1/horizon-8/divergence-growth/abstention criteria.

- [ ] **Step 7: Regenerate first V2 receipt and inspect without tuning thresholds**

Run:

```bash
node scripts/run-default.mjs
node tests/run-tests.mjs
```

Record the actual scientific outcome. If Gate 9 fails, stop V2 scientific tuning; still proceed to V3 only as an explicitly diagnostic arm using available policies.

- [ ] **Step 8: Verify deterministic receipt**

Regenerate twice and deep-compare parsed JSON.

---

### Task 5: V3 Closed-Loop Probes and Global Monitor

**Files:**
- Create: `src/global_consistency.js`
- Modify: `src/v2_experiment.js`
- Modify: `src/metrics.js`
- Modify: `tests/run-tests.mjs`

**Interfaces:**
- Produce `makeLoopEpisodes({substrate,policies,seed})` for L1/L2/L3.
- Produce `loopMetrics(episode)` with local legality, readout closure, invariant closure, sequence, max applicability residual, max Newton residual.
- Produce `calibrateClosureMonitor(calibration) -> {threshold}`.
- Produce `evaluateClosureMonitor(monitor,heldout) -> {badRecall,falsePositiveRate}`.

- [ ] **Step 1: Add failing loop/monitor tests**

Synthetic good/bad loop episodes must calibrate a threshold from calibration only and then classify held-out episodes without task labels. Assert monitor inputs contain closure/invariant quantities but no final task label.

- [ ] **Step 2: Run tests and verify RED**

Expected: missing global consistency module.

- [ ] **Step 3: Implement L1/L2/L3 executable loops**

L1 executes two identical toggle contexts. L2 applies a fixed positive context then fixed inverse context. L3 uses fixed signed control templates to execute `AB A^-1 B^-1` and reversed ordering. All steps go through the same causal substrate and record local legality.

- [ ] **Step 4: Implement loop-level closure metrics**

Normalize full-state closure over designated invariant coordinates by fixed safety scale. Preserve separate readout closure. A loop is locally legal only if every motif accepts, every control is bounded, every step converges, and all states stay finite.

- [ ] **Step 5: Implement calibration-only threshold monitor**

Use maximum of readout/full-state normalized closure as anomaly score. Select the smallest calibration threshold giving <=0.10 false-positive rate on calibration good loops; freeze it for held-out evaluation.

- [ ] **Step 6: Implement Gates 12–13**

Gate 12 PASS only if at least one held-out episode has all local legality checks green but closure error >0.10.

Gate 13 PASS only if bad recall >=0.90 and good false-positive rate <=0.10 on held-out loops, with no task-label feature.

- [ ] **Step 7: Run tests and verify GREEN**

Run: `node tests/run-tests.mjs`.

---

### Task 6: Pages UI, README, Receipt Schema, and CI Verification

**Files:**
- Modify: `index.html`
- Modify: `src/ui.js`
- Modify: `README.md`
- Modify: `results/default.json`
- Modify: `tests/run-tests.mjs`

**Interfaces:**
- Add UI ids: `v2-gates`, `v2-task-table`, `v2-motif-view`, `v2-horizon-view`, `v3-loop-table`, `v3-monitor-summary`.

- [ ] **Step 1: Add failing UI/receipt integrity tests**

Assert the six IDs exist, receipt schema is 3, `causalControl` exists, `globalConsistency` exists, and Gates 8–13 have boolean `pass` plus evidence.

- [ ] **Step 2: Run tests and verify RED**

Expected: missing V2/V3 page elements.

- [ ] **Step 3: Add V2 section without replacing V0/V1 panels**

Render fixed-substrate integrity, search/compressed/global/nearest/zero/random task results, motif count/use, UNKNOWN rate, and horizon divergence.

- [ ] **Step 4: Add V3 loop section**

Render local-legality status beside global closure error for each representative loop, plus monitor threshold/recall/FPR. Make the distinction between local legality and global correctness visually explicit.

- [ ] **Step 5: Update README from the measured receipt only**

State which of Gates 8–13 passed or failed and the narrow allowed interpretation. Do not call the result general algorithm discovery.

- [ ] **Step 6: Regenerate compact deterministic receipt**

Store only representative routes/loops while keeping all scalar gate evidence. Use minified JSON if necessary; parsed object must reproduce exactly.

- [ ] **Step 7: Run complete verification**

Run:

```bash
node scripts/run-default.mjs
node tests/run-tests.mjs
```

Expected: all engineering tests PASS; scientific gates may PASS or FAIL independently.

- [ ] **Step 8: Push one verified implementation snapshot and open/update PR**

Push to `v2/causal-control-substrate`, open a PR against the appropriate base, and require GitHub Actions to independently regenerate the receipt and pass engineering tests before completion is claimed.
