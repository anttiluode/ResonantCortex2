# ResonantCortex2 Algorithm Search Lab — Design

## Purpose

ResonantCortex2 is a falsifiable experiment in **algorithm search and compilation**. The project asks whether a small continuous recurrent system can discover reusable local computations from successful search trajectories, route among those computations geometrically, execute them on unseen instances, and only afterward attempt to explain the resulting circuit.

The project is explicitly **not** a claim that genetic algorithms, eigenmodes, dendrites, or resonant networks are themselves novel. The novelty test is whether the combined search → compress → route → iterate pipeline discovers reusable computation that transfers across instances or search procedures and can be causally characterized after freezing.

## Core Hypothesis

A useful algorithm can be represented as repeated application of a small bank of learned local operators together with state-dependent applicability gates:

```text
state s_t
  -> measure applicability of learned modes/operators
  -> select or mix applicable operator(s)
  -> produce s_{t+1}
  -> repeat until termination
```

The learned object is therefore not only a vector direction. Each reusable instruction candidate contains:

1. an applicability region / gate,
2. a local state-transition operator,
3. successor statistics describing what tends to become applicable next.

Search is only a generator of successful traces. The system must not depend conceptually on one search method.

## Scientific Rule

**Computation first; interpretation second.**

The search/compression system is optimized only for task success and compact reusable structure. Human-readable names such as `square`, `xor`, `swap`, `mod`, `compare`, or `carry` are never exposed to the learner. After training/search is frozen, a separate interpreter probes the resulting operators and transition graph and proposes descriptions.

The frozen executable machine remains ground truth. A symbolic description counts as successful only to the extent that it reproduces or predicts the frozen machine's behavior.

## No Intermediate Oracle

The benchmark may compute the correct final answer or final task score in order to rank candidate solutions. It must **not** provide the learner with the known intermediate states of the human/reference algorithm.

Search therefore receives:

```text
initial state + generic transform vocabulary + final score
```

not:

```text
initial state + teacher's next state + teacher's next state + ...
```

Successful trajectories are the trajectories actually taken by successful searched candidates. The compressor sees those discovered trajectories after the fact.

## V0 Scope

The first release is a browser-only GitHub Pages laboratory with deterministic seeded experiments. No backend, model API, database, build system, or external dependency is required.

V0 contains four task families chosen to require meaningfully different computation:

### Task A — Mandelbrot Recurrence

Goal: discover a recurrent machine whose repeated local updates reproduce Mandelbrot escape-time structure on held-out complex coordinates.

The primitive vocabulary must not include a built-in `z^2 + c`, complex square, or Mandelbrot-specific operator. The benchmark may calculate reference escape times only for scoring candidates and evaluation.

Success is measured on unseen `c` values and by escape-map structure, not by teacher-forced one-step regression.

### Task B — Euclidean GCD

Goal: solve held-out integer pairs with conditional recurrence.

The primitive vocabulary must not include `gcd` or a complete Euclidean step as one atomic operator. Search receives the initial pair and final-answer score only.

Success requires exact GCD on held-out pairs and termination within a bounded step budget.

### Task C — Sort Four Values

Goal: sort unseen 4-element vectors.

The primitive vocabulary must not include a complete sorting network or named compare-swap instruction. Generic local transforms and state-conditioned routing are allowed.

Success requires exact sorted order on held-out vectors and generalization beyond the search instances.

### Task D — Parity Recurrence

Goal: compute sequence parity on unseen binary sequences using recurrent state.

The primitive vocabulary must not expose `xor` as a named or complete primitive. The learner must discover an equivalent reusable transition if it needs one.

Success requires exact held-out parity across sequence lengths not all seen in search.

## Representation

Each task exposes a fixed-width numerical state vector plus a task-defined termination/readout contract. The state representation may include explicit input slots, work registers, a step counter, and an output slot, but may not contain hidden labels naming the correct primitive operation.

The first implementation keeps state dimension at or below 16 scalars per task and the compressed bank at or below 12 modes so every learned operator can be rendered and directly probed in the browser.

## Generic Search Transform

The search vocabulary is numerical rather than symbolic. A candidate step is a small parameterized transform with no task-specific operation name:

```text
preactivation h = A s + b
soft gate      g = sigmoid(k * (u·s + c))
next state     s' = s + g * h
```

Search mutates/selects the coefficients `A`, `b`, `u`, `c`, and `k`, and may compose multiple steps recurrently. This vocabulary can express local affine motion, conditional motion, copying/permutation-like behavior, thresholds, and piecewise approximations without exposing named algorithms.

Mandelbrot is intentionally difficult for this vocabulary: a finite bank of gated local affine maps must approximate a nonlinear recurrence through routing/piecewise structure rather than receiving multiplication as a privileged primitive.

## Candidate Compressed Mode

A compressed mode `i` contains:

```text
source model: prototype/subspace describing where the mode was used
transition:   s' = A_i s + b_i
activation:   g_i(s) = sigmoid(beta_i * (theta_i - R_i(s)))
```

`R_i(s)` is a source-state residual or distance learned from states associated with the mode. It is computable from the current state alone. The true next state is never available to the execution-time router.

This keeps the discovered instruction visually inspectable and permits direct ablations.

## Search

Search produces candidate programs/trajectories from final task score. V0 supports two materially different generators over the same numerical transform representation:

1. evolutionary mutation/selection,
2. simulated annealing / stochastic local search.

Default browser budget is **4,000 candidate evaluations per generator per task**. UI controls may lower or raise this, but default receipts use the fixed budget.

A successful trace is the actual state sequence produced by a high-scoring candidate. The compressor receives successful traces, not solver identity by default.

Solver identity is retained only as analysis metadata so Gate 4 can test whether modes reflect reusable computation or merely identify the generating solver.

## Compression

Compression clusters recurring successful transitions and fits reusable local affine operators plus source-state applicability models.

A candidate cluster becomes a mode only if its fitted transition improves validation error over assigning those transitions to the global task operator. V0 uses deterministic greedy split/merge clustering and caps the bank at 12 modes.

The important measurement is not compression ratio alone. The frozen mode bank must execute unseen instances without replaying the original search.

## Routing and Execution

At each step:

1. compute `R_i(s)` and gate value for every learned mode,
2. choose the highest gate above threshold,
3. apply that mode's transition operator,
4. update the state,
5. stop on task termination or the task step budget.

V0 uses **hard top-1 routing** so route sequences and ablations remain interpretable. Soft mixtures are deferred.

If no mode exceeds the threshold, the executor emits `UNKNOWN` rather than silently choosing an arbitrary mode. This is central to the search-compiler hypothesis: unknown states are candidates for invoking expensive search in later versions.

V0 records the complete route as a mode-ID sequence.

## Post-hoc Interpreter

The interpreter runs only after the mode bank is frozen.

For every mode it reports:

- source-state activation region,
- effective rank / singular values of the affine map,
- variables most changed and most preserved,
- empirical invariants,
- common predecessor and successor modes,
- causal ablation effect on each task,
- simple candidate descriptions when supported by probes.

The interpreter may test a small library of descriptions such as copy, negate, add/subtract, swap-like permutation, threshold/select, rotate/scale, and binary-state toggle. These labels are analysis aids only and never enter search or compression.

A mode may remain `UNNAMED` while still being counted as a reusable discovered computation.

## Baselines

Every task uses the same seeded search/evaluation instances where applicable. V0 compares:

1. **Search-only** — rerun the original search on each held-out instance.
2. **Global transform** — one fitted affine transition/operator for the task.
3. **Compressed routed modes** — the proposed system, maximum 12 modes.
4. **Tiny neural baseline** — one hidden-layer MLP or small recurrent network trained on the successful searched transitions, with total trainable scalar parameters between **0.5× and 2×** the compressed mode bank's parameter count.

Optional diagnostic: nearest-neighbor transition replay. It is useful if cheap enough but is not required for V0's first implementation.

## Evaluation Sets

Each task uses disjoint deterministic seeds for:

- search instances,
- compression-validation trace fragments,
- final held-out execution instances.

Default final held-out sizes:

- Mandelbrot: 96×96 coordinate grid, 32 recurrent steps,
- GCD: 128 unseen integer pairs,
- sort-4: 256 unseen vectors,
- parity: 256 unseen sequences spanning lengths 5–20.

These defaults are recorded in `results/default.json`.

## Gates

Scientific failures remain visible and do not fail CI unless an engineering invariant breaks.

### Gate 0 — Local Compression Is Real

For at least **3 of 4** task families, compressed routed modes must reduce held-out transition NMSE by at least **25%** relative to the single global affine operator:

```text
NMSE_modes <= 0.75 * NMSE_global
```

while respecting the 12-mode cap.

### Gate 1 — Compiled Execution Generalizes

For at least **2 of 4** task families, the frozen routed bank must improve final held-out task score over the global-transform baseline by at least **20 percentage points** and must reach at least **80% exact success** on discrete tasks.

For Mandelbrot, instead of exact success, both conditions are required on the held-out escape map:

```text
Pearson correlation >= 0.90
normalized MAE <= 0.12
```

where escape times are normalized by the 32-step maximum.

### Gate 2 — Search Is Actually Compressed

For every task counted as passing Gate 1, frozen compiled execution must use at least **20× fewer candidate evaluations** than search-only on the held-out set while retaining at least **90% of search-only task score**.

A deterministic mode application counts as one compiled step, not as a candidate evaluation. The receipt reports both counts separately.

### Gate 3 — Routing Matters

At least one Gate-1-passing task must lose either **20 percentage points of exact success** or **25% of its continuous score** when routing is disabled and execution is forced through the single global operator or a randomly selected learned mode.

### Gate 4 — Reusable Structure Is Not Merely Solver Identity

Pool successful traces from both search generators. At least one mode or route motif of length 2–4 must satisfy both:

- appear in successful traces from **both** generators,
- retain at least **80%** of its within-generator transition fidelity when evaluated on trace fragments produced by the other generator.

If modes instead cleanly classify solver identity but fail cross-generator fidelity, Gate 4 fails and that negative result is reported.

### Gate 5 — Explanation Fidelity

At least one discovered mode must admit a compact post-hoc surrogate from the interpreter's fixed description library whose outputs achieve:

```text
R^2 >= 0.98
```

against the frozen mode on an independent probe set of at least 1,000 source states.

This gate is intentionally secondary: failure does not invalidate a useful but unnamed computation.

## Mandelbrot-Specific Integrity Check

The Mandelbrot task contains two visibly separate experiments:

- **Imitation control:** fit the known one-step `z^2 + c` law directly. This recreates the original ResonantCortex-style result and confirms the renderer/evaluator.
- **Discovery experiment:** hide that law from the transform vocabulary and let final-score search plus compression discover an executable recurrent approximation.

The imitation control cannot be reported as evidence for algorithm discovery.

## UI

`index.html` is a static interactive lab rather than a marketing page.

The first release shows:

- task selector,
- seed and search-budget controls,
- run search / compress / execute controls,
- score and evaluation table,
- discovered mode cards showing applicability and operator summaries,
- route sequence/graph for a selected held-out instance,
- Mandelbrot truth vs compiled escape-map canvases,
- ablation controls for routing, individual modes, and global-transform baseline,
- explicit PASS/FAIL badges for Gates 0–5.

The UI distinguishes **engineering status** from **scientific result**.

## Determinism and Reproducibility

All stochastic components use explicit seeded PRNG state. A complete experiment configuration serializes to JSON. Evaluation uses frozen held-out instances generated from independent seeds.

The browser report exposes seed, budgets, mode count, success metrics, and gate outcomes so screenshots are interpretable.

## Repository Layout

Planned structure:

```text
index.html                 static lab shell
src/prng.js                deterministic random utilities
src/tasks.js               task definitions and final scoring contracts
src/operators.js           generic searched/compressed transform representation
src/search.js              two search generators and discovered trace format
src/compress.js            transition clustering/operator fitting
src/executor.js            routing, recurrence, UNKNOWN handling
src/interpreter.js         post-hoc probes and candidate descriptions
src/metrics.js             task metrics, baselines, gate calculations
src/ui.js                  browser rendering and controls
tests/run-tests.mjs        deterministic engineering/science smoke tests
README.md                  hypothesis, usage, current receipts
results/default.json       default seeded experiment receipt
```

No framework or package install is required for the Pages app. Tests use the Node.js runtime available on GitHub Actions.

## CI and Pages

The existing Pages workflow remains the deployment mechanism.

Add a separate CI workflow that runs deterministic unit/smoke tests on pushes and pull requests. Engineering failures include syntax errors, nondeterminism under fixed seed, invalid metrics, broken task contracts, or impossible serialized receipts.

Scientific gate failures are recorded in `results/default.json` and rendered in the UI; they do not make CI red.

## Non-goals for V0

V0 does not attempt:

- unrestricted program synthesis,
- natural-language algorithm generation,
- large neural models,
- GPU training,
- biological realism,
- claims that dendrites literally implement these equations,
- automatic growth without evidence the fixed small bank works,
- cross-domain transfer beyond the four first task families.

## Success Interpretation

The strongest positive V0 result would be:

> Different search procedures discover successful trajectories from final task score alone; compression extracts a small shared bank of local operators; state-dependent geometric routing composes them into a recurrent machine that solves held-out instances more cheaply than rerunning search; and at least part of that machine can be explained post hoc without those symbolic names having been supplied during discovery.

A weaker but still useful result is that routed local operators outperform a global transform on some task families but fail cross-solver reuse or symbolic explanation.

A clean negative result is also valuable: if nearest-neighbor replay, a tiny MLP, or a single global operator matches the system, or if compressed modes fail to execute beyond stored traces, the algorithm-search hypothesis has not yet earned further complexity.
