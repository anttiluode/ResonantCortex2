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

## V0 Scope

The first release is a browser-only GitHub Pages laboratory with deterministic seeded experiments. No backend, model API, database, build system, or external dependency is required.

V0 contains four task families chosen to require meaningfully different computation:

### Task A — Mandelbrot Local Law

Goal: discover a recurrent machine that approximates the local update needed to reproduce Mandelbrot escape-time structure on held-out complex coordinates.

The learner may observe successful input/state/output trajectories generated during search, but the primitive vocabulary must not include a built-in `z^2 + c`, complex square, or Mandelbrot-specific operator.

Success is measured on unseen `c` values and by image-level escape-map similarity, not merely one-step training loss.

### Task B — Euclidean GCD

Goal: solve held-out integer pairs with conditional recurrence.

The primitive vocabulary must not include `gcd` or a complete Euclidean step as one atomic operator. Search may combine generic arithmetic/state transforms and gates.

Success requires exact GCD on held-out pairs and termination within a bounded step budget.

### Task C — Sort Four Values

Goal: sort unseen 4-element vectors.

The primitive vocabulary must not include a complete sorting network or named compare-swap instruction. Generic local transforms and state-conditioned routing are allowed.

Success requires exact sorted order on held-out vectors and generalization beyond the search tape.

### Task D — Parity / XOR Recurrence

Goal: compute sequence parity on unseen binary sequences using recurrent state.

The primitive vocabulary must not expose `xor` as a named or complete primitive. The learner must discover an equivalent reusable transition if it needs one.

Success requires exact held-out parity across lengths not all seen in search.

## Representation

Each task exposes a fixed-width numerical state vector plus a task-defined termination/readout contract. The state representation may include explicit input slots, work registers, a step counter, and an output slot, but may not contain hidden labels naming the correct primitive operation.

The first implementation should keep dimensions small enough that every learned operator can be rendered and directly probed in the browser.

## Candidate Local Operator

A mode `i` consists of a local affine transition plus a low-complexity nonlinearity/gate:

```text
candidate prediction: s' = A_i s + b_i
applicability residual: E_i(s, observed_transition)
activation: g_i = sigmoid(beta * (theta_i - E_i))
```

For execution, the system uses state-derived applicability rather than access to the true next state. V0 may estimate a mode's region using a learned prototype/subspace of the source states associated with that operator.

The preferred implementation is intentionally small:

- source-state subspace/prototype for applicability,
- affine local transition for action,
- soft or hard gate,
- recurrence over a bounded number of steps.

This keeps the discovered instruction visually inspectable and permits direct ablations.

## Search

Search produces candidate trajectories. V0 must support at least two materially different search generators so that discovered structure can be tested for solver dependence.

Recommended initial generators:

1. evolutionary / mutation search,
2. stochastic local search or simulated annealing.

The search representation is shared across generators. A successful trace is a sequence of state transitions with a task score. The compressor receives successful traces, not solver identity by default.

Solver identity may be retained only for later analysis of whether modes correlate with the generating solver or with task-relevant transition structure.

## Compression

Compression clusters recurring successful transitions and fits reusable local operators.

A compressed mode is accepted only when replacing its member transitions with the fitted mode preserves low transition error on held-out trace fragments.

Compression should prefer fewer modes when predictive quality is comparable. V0 may use a simple greedy split/merge strategy rather than an elaborate optimizer.

The important measurement is not compression ratio alone. The test is whether the frozen mode bank can **execute** unseen instances without replaying the original search.

## Routing and Execution

At each step:

1. compute applicability score for every learned mode from the current state,
2. select the best sufficiently applicable mode or a small weighted mixture,
3. apply its transition operator,
4. update the state,
5. stop on task termination or step budget.

If no mode is sufficiently applicable, the executor emits `UNKNOWN` rather than silently choosing an arbitrary mode. This residual/unknown signal is central to the search-compiler idea: unknown states are candidates for invoking expensive search in later versions.

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

Every task uses the same seeded train/search/evaluation tapes where applicable. V0 compares:

1. **Search-only** — rerun the original search on every new instance.
2. **Global transform** — one fitted global transition/operator for the task.
3. **Compressed routed modes** — the proposed system.
4. **Tiny matched neural baseline** — a small MLP/recurrent baseline with roughly comparable parameter count, trained on the same successful transition data.

Optional diagnostic: nearest-neighbor transition replay. This is useful if cheap enough, but it is not required for the first gate.

## Gates

Scientific failures remain visible and do not fail CI unless an engineering invariant breaks.

### Gate 0 — Local Compression Is Real

For at least three of the four task families, compressed local operators predict held-out successful trace transitions substantially better than the one-global-transform baseline at comparable or lower complexity.

### Gate 1 — Compiled Execution Generalizes

For at least two task families, a frozen routed mode bank solves held-out instances materially better than the global-transform baseline without invoking the original search.

Mandelbrot must additionally reproduce recognizable held-out escape-time structure rather than only low one-step error.

### Gate 2 — Search Is Actually Compressed

On the task families passing Gate 1, compiled execution must require substantially fewer candidate evaluations than search-only while retaining useful solution quality.

The report records the actual ratio; no result is promoted by hiding failed tasks.

### Gate 3 — Routing Matters

At least one passing task must degrade materially when routing is disabled and all states are forced through one averaged/global operator or a randomly chosen mode.

### Gate 4 — Reusable Structure Is Not Merely Solver Identity

Pool successful traces from the two search generators. At least one learned mode or short route motif must recur across both generators on the same task family, or transfer to a held-out solver-generated tape. If modes only classify which solver produced them, record that as a negative result.

### Gate 5 — Explanation Fidelity

At least one discovered mode must admit a compact post-hoc description whose explicit surrogate predicts the frozen mode's outputs on probes with high fidelity. This gate is intentionally secondary: failure does not invalidate a useful but unnamed computation.

## Mandelbrot-Specific Integrity Check

The Mandelbrot task must distinguish two experiments:

- **Imitation control:** fit the known one-step law directly. This recreates the original ResonantCortex-style result and confirms the renderer/test harness.
- **Discovery experiment:** hide that law from the mode vocabulary and let search/compression discover an executable recurrent approximation from successful traces.

The control cannot be reported as evidence for algorithm discovery.

## UI

`index.html` is a static interactive lab rather than a marketing page.

The first release should show:

- task selector,
- seed and search-budget controls,
- run-search / compress / execute buttons,
- score and evaluation table,
- discovered mode cards showing applicability and operator summaries,
- route graph / route sequence for selected held-out instance,
- Mandelbrot truth vs compiled escape-map canvases,
- ablation controls for routing, individual modes, and global-transform baseline,
- explicit PASS/FAIL badges for Gates 0–5.

The UI must distinguish **engineering status** from **scientific result**.

## Determinism and Reproducibility

All stochastic components use explicit seeded PRNG state. A single experiment configuration serializes to JSON. Evaluation uses frozen held-out tapes generated from independent seeds.

The browser report must expose seed, budgets, mode count, success metrics, and gate outcomes so screenshots are interpretable.

## Repository Layout

Planned structure:

```text
index.html                 static lab shell
src/prng.js                deterministic random utilities
src/tasks.js               task definitions and state/readout contracts
src/operators.js           generic local operator representation
src/search.js              search generators and trace format
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

> Different search procedures discover successful trajectories; compression extracts a small shared bank of local operators; state-dependent geometric routing composes them into a recurrent machine that solves held-out instances more cheaply than rerunning search; and at least part of that machine can be explained post hoc without those symbolic names having been supplied during discovery.

A weaker but still useful result is that routed local operators outperform a global transform on some task families but fail cross-solver reuse or symbolic explanation.

A clean negative result is also valuable: if nearest-neighbor replay, a tiny MLP, or a single global operator matches the system, or if compressed modes fail to execute beyond stored traces, the algorithm-search hypothesis has not yet earned further complexity.
