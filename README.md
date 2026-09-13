# ResonantCortex2 — Algorithm Search Lab

**Status: V2/V3 causal-control experiment complete. The fixed substrate is valid (Gate 8 PASS), but search does not yet generalize on enough natural tasks for a V2 policy-discovery claim (Gate 9 FAIL). V3 demonstrates locally legal but globally inconsistent closed compositions (Gate 12 PASS), while the first global monitor fails to generalize (Gate 13 FAIL).**

Live Pages target: `https://anttiluode.github.io/ResonantCortex2/`

ResonantCortex2 asks a deliberately hard question:

> Can generic numerical search discover useful computation, can successful trajectories be compressed into a small bank of local operators, and can state-dependent geometry route those operators into an executable algorithm on unseen problems?

The project is not tied to genetic algorithms. V0 uses two different trace generators—evolutionary mutation/selection and simulated annealing—over the same unnamed numerical microcircuit representation.

## The loop

```text
SEARCH
  ↓
high-scoring discovered trajectories
  ↓
COMPRESS into local affine modes
  ↓
ROUTE by source-state geometry
  ↓
ITERATE the frozen mode bank
  ↓
held-out task result
  ↓
INTERPRET only afterward
```

The central rule is **computation first; interpretation second**. Human-readable operations such as `xor`, `swap`, `gcd`, `square`, or `compare` are never supplied to search or compression.

## No intermediate oracle

Search receives:

```text
initial state + generic gated-affine transforms + final task score
```

It does **not** receive:

```text
reference next state → reference next state → reference next state
```

Only individual trajectories scoring at least `0.80` are eligible for compression. This matters: a poor trace from the best overall candidate is not silently relabeled as a successful computation.

## Generic searched microcircuit

Each unnamed transform has the form

```text
h = A s + b
g = sigmoid(k * (u·s + c))
s' = s + g h
```

The same generic transform family is used for all tasks. Search mutates the coefficients; the task only provides inputs and a final score.

Successful transitions are later compressed into local affine modes. Each mode stores:

- an affine transition,
- a source-state prototype/scale,
- an applicability threshold,
- which search generators contributed qualifying traces.

Frozen execution uses hard top-1 routing. If no mode explains the current state well enough, execution returns `UNKNOWN` instead of choosing an arbitrary route.

## Four benchmark tasks

1. **Mandelbrot recurrence** — discover a recurrent approximation that reproduces held-out escape-time structure without receiving `z² + c` as a primitive.
2. **Euclidean GCD** — solve unseen integer pairs through recurrent state without a `gcd` or complete Euclidean-step primitive.
3. **Sort 4** — sort unseen four-value inputs without a named compare-swap or sorting network.
4. **Parity recurrence** — compute parity of unseen sequences without an XOR primitive.

A separate privileged Mandelbrot known-law control verifies the renderer/evaluator. It is explicitly marked **not algorithm discovery**.

## Current deterministic receipt

Committed receipt: [`results/default.json`](results/default.json)

The receipt uses seed `17`, budget `120` candidate evaluations per generator per task, and the bounded `receipt` evaluation scale. The preregistered full configuration remains `4,000` evaluations per generator per task with the larger held-out sets. Therefore this receipt is an engineering/scientific development receipt, not the final full-budget experiment.

### Gate status

| Gate | Result | Current interpretation |
| --- | --- | --- |
| Gate 0 — local compression | **FAIL** | Fewer than 3/4 tasks beat the global transition baseline by the preregistered 25%. |
| Gate 1 — compiled execution | **FAIL** | No task family meets the held-out execution criterion. |
| Gate 2 — search compressed | **FAIL** | Cannot pass before useful compiled execution exists; full search-only held-out baseline is also not yet measured in this bounded receipt. |
| Gate 3 — routing matters | **FAIL** | No Gate-1-passing task exists to support a causal routing claim. |
| Gate 4 — cross-solver reuse | **PASS** | Shared high-scoring trace geometry appears for Mandelbrot and parity. This is weaker than algorithm success. |
| Gate 5 — explanation fidelity | **PASS** | At least one frozen mode admits a high-fidelity simple post-hoc surrogate; current winners are largely identity-like. |
| Gate 6 — autonomy gap localized | **PASS** | Teacher-state local prediction can be very good while open-loop replay drifts strongly on the same frozen modes. |
| Gate 7 — successor routing improves | **FAIL** | One-step successor lookahead helps some scores / UNKNOWN rates, but not by the preregistered amount needed to count as useful algorithmic continuation. |

### Selected current numbers

| Task | qualifying traces | modes | local NMSE | global NMSE | compiled score | global score | exact / Mandelbrot metric |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Mandelbrot | 15 | 3 | 0.00393 | 0.01315 | 0.476 | 0.705 | corr 0.119, normalized MAE 0.524 |
| GCD | 3 | 2 | 0.00145 | 0.00086 | 0.021 | 0.021 | exact 0.021 |
| Sort 4 | 3 | 2 | ~0 | ~0 | 0.367 | 0.408 | exact 0.000 |
| Parity | 13 | 1 | 0.44268 | 0.44268 | 0.557 | 0.573 | exact 0.469 |

The interesting failure is clear: **some searched trajectories contain locally compressible and cross-solver structure, but fitting those fragments does not yet produce a useful autonomous recurrent program.** V1 now sharpens that statement: the dominant failure is usually **accumulated rollout drift**, not simply a bad source-state router.

### V1 computation autopsy

V1 separates the coordinates controlled by the task environment from the **endogenous** coordinates the discovered computation must maintain itself. It then compares teacher-state one-step prediction, fixed route replay, free routing, and an oracle-best-existing-mode diagnostic.

| Task | teacher one-step endogenous | fixed replay h4 | free replay h4 | h8 (when available) | diagnosis |
| --- | ---: | ---: | ---: | ---: | --- |
| Mandelbrot | 0.00398 | 0.04250 | 0.04453 | fixed 0.12729 | **accumulation** |
| GCD | 0.00058 | 0.00007 | 0.00007 | 0.00016 | mixed / no large early gap |
| Sort 4 | 0.00002 | 0.00004 | 0.00004 | 0.00004 | accumulation (small absolute scale) |
| Parity | 0.01013 | 0.04060 | 0.04060 | 0.08386 | **accumulation** |

The important point is that Mandelbrot and parity do **not** mainly fail because the router chooses the wrong branch at the first opportunity. A locally good operator sequence, replayed open-loop, leaves the searched trajectory because small approximation errors compound.

### V1 successor routing

A second arm learns mode-to-mode transition probabilities from the successful searched traces and lets a candidate mode look one step into its own predicted future before firing. This helps, but not enough:

| Task | source-only score | successor score | global score | source UNKNOWN | successor UNKNOWN |
| --- | ---: | ---: | ---: | ---: | ---: |
| Mandelbrot | 0.476 | **0.514** | 0.705 | 0.780 | **0.535** |
| GCD | 0.021 | 0.021 | 0.021 | 1.000 | 1.000 |
| Sort 4 | 0.367 | 0.367 | 0.408 | 1.000 | 1.000 |
| Parity | 0.557 | **0.588** | 0.573 | 0.391 | 0.344 |

So Gate 7 stays **FAIL**. The one-step lookahead is directionally useful on Mandelbrot and parity, but it does not close the loop strongly enough to become an autonomous algorithm. The next problem is therefore more precise: **learn operators whose outputs remain on the reusable computational manifold under repeated composition**, not merely operators with low one-step error.

That distinction is exactly why the project keeps local prediction, rollout autonomy, and held-out task success as separate measurements.

## V2/V3 — fixed causal substrate, searched controls only

V2 changes the scientific object rather than trying to repair V1's transition approximator. Search is no longer allowed to predict or overwrite the next state. It may emit only a bounded three-site control vector. Every state transition is generated by one fixed nine-state causal graph circuit:

```text
current state + external input
            |
            v
 searched / compiled control policy
            |
            v
      bounded control u_t
            |
            v
 fixed passive P/X transport
 + local implicit nonlinear closure
            |
            v
         next state
```

The same substrate, site locations, integration step, and nonlinear law are used for all four primary V2 tasks. The committed receipt uses seed `17`, V1 historical budget `120`, V2 search budget `400` per generator per task, 10 search instances, and 32 held-out V2 instances per task.

### V2/V3 gate status

| Gate | Result | Current interpretation |
| --- | --- | --- |
| Gate 8 — causal substrate valid | **PASS** | 1,200 stress steps stayed finite; implicit solves converged 100%; replay is deterministic; controls alter state without mutating substrate; public execution cannot overwrite next state. |
| Gate 9 — search finds controllable tasks | **FAIL** | Only delayed copy and temporal pattern discrimination generalize strongly enough on held-out instances. Toggle and stateful switch do not. The preregistered requirement is 3/4 tasks. |
| Gate 10 — control compression generalizes | **FAIL** | No claim is made because Gate 9 already failed. Delayed-copy motifs retain high score, but the required global-map advantage / abstention criteria are not met across two tasks. |
| Gate 11 — composition survives horizon | **FAIL** | The compressed policy bank does not meet the two-task horizon + abstention criterion. |
| Gate 12 — local legality is not global correctness | **PASS** | Several fixed closed-loop probes keep every local substrate/control check green but end with normalized closure error above 0.10. |
| Gate 13 — global monitor detects composition failure | **FAIL** | The first calibration-frozen closure monitor has bad-loop recall `0.00` and false-positive rate `0.25` on held-out loops. |

### V2 held-out results

| Task | search score | search exact | no-control | compressed | global map | nearest successful control | UNKNOWN episodes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Toggle / parity | 0.444 | 0.438 | 0.519 | 0.495 | 0.439 | 0.438 | 1.000 |
| Delayed copy | **0.999** | **1.000** | 0.509 | **0.981** | 0.962 | **0.995** | 1.000 |
| Temporal pattern | **0.975** | **1.000** | 0.491 | 0.531 | 0.531 | **0.976** | 0.156 |
| Stateful switch | 0.469 | 0.563 | 0.444 | 0.321 | 0.365 | 0.392 | 1.000 |

The result is deliberately stopped at Gate 9 rather than tuned toward a pass. It says the fixed causal substrate is numerically sound and search can program it for some natural temporal behaviors, but **the chosen substrate/policy family does not yet support the preregistered breadth of held-out control behavior**.

The delayed-copy arm is informative but insufficient on its own: search reaches `0.999` held-out score and the compressed motif bank reaches `0.981`, yet every held-out episode eventually leaves the learned applicability regions. That is why Gate 10 stays red despite the attractive score.

### V3 closed-loop fence

The V3 probes intentionally separate local legality from global closure. Each step uses a bounded control, every implicit solve converges, states remain finite, and the local applicability test is green. Yet the final state can still fail to return:

| Probe | local legal | readout closure | state closure | global closure |
| --- | --- | ---: | ---: | ---: |
| L1 double toggle | yes | 0.248 | 0.055 | **0.248** |
| L2 pulse / inverse pulse | yes | 0.230 | 0.033 | **0.230** |
| L3 `A B A⁻ B⁻` analogue | yes | 0.167 | 0.123 | **0.167** |
| L3 reversed ordering | yes | 0.034 | 0.123 | **0.123** |

This earns only the narrow claim that **locally admissible causal steps can compose into a globally inconsistent closed sequence**. The first global monitor does not yet solve the problem, so V3 remains a detection problem rather than a prevention result.

The practical lesson from V2/V3 is now sharper than the original V0 framing:

```text
trusted causal dynamics
        +
searched control policy
        +
held-out composition tests
        +
separate global-consistency checks
```

is a better-defined experimental object than asking a learned transition model to invent both the laws of motion and the algorithm at once. It is still **not** a general program-synthesis result.

## Browser lab

`index.html` is a dependency-free GitHub Pages experiment viewer. It exposes:

- deterministic seed and search budget,
- task inspection,
- Gate 0–7 status,
- evolutionary vs annealing search scores,
- local-vs-global compression error,
- discovered mode cards,
- post-hoc names or `UNNAMED`,
- a frozen route sequence with explicit `UNKNOWN`,
- Gate 6 computation-autopsy horizon curves and failure classification,
- Gate 7 successor edges / continuation-aware route diagnostics,
- reference vs compiled Mandelbrot escape maps,
- the separate known-law integrity control.

The page loads the committed receipt immediately. You can also rerun the experiment in the browser. The preregistered browser budget field defaults to `4000`; large runs are CPU-heavy.

## Run locally

No install step is required. Node 20+ is enough for tests and receipts.

```bash
node tests/run-tests.mjs
node scripts/run-default.mjs
```

Serve the repository with any static HTTP server to use the browser lab, for example:

```bash
python -m http.server 8000
```

then open `http://localhost:8000/`.

## Repository structure

```text
index.html
src/
  prng.js          deterministic randomness
  tasks.js         task environments and final scoring
  operators.js     unnamed gated-affine microcircuits
  search.js        evolutionary + annealing trace generators
  compress.js      transition fitting and local mode compression
  executor.js      source-only + successor-aware routing and recurrence
  autopsy.js       teacher/replay/free/oracle rollout diagnostics
  successor.js     learned mode-transition graph + lookahead router
  metrics.js       baselines and preregistered Gates 0–13
  interpreter.js   post-hoc mode probing / naming
  experiment.js    V0/V1 experiment orchestration
  causal_substrate.js fixed causal P/X + implicit nonlinear step
  control_tasks.js  V2 natural temporal task streams
  control_policy.js searched bounded control-policy representation
  control_search.js evolution + annealing over control policies
  control_compress.js successful state/input/control -> motifs
  control_execute.js autonomous motif policy through exact substrate
  global_consistency.js V3 closed-loop probes + monitor
  v2_experiment.js  combined V0/V1 + V2/V3 report
scripts/
  run-default.mjs  deterministic receipt generator
results/
  default.json     committed development receipt
tests/
  run-tests.mjs    engineering + gate-boundary regression tests
```

## Interpretation discipline

A search score is not an algorithm.

A low local transition NMSE is not an algorithm.

A mode that appears in both solvers is not automatically useful.

A pretty Mandelbrot control is not discovery.

The hypothesis earns support only when the **frozen compressed routed machine itself** solves held-out tasks under the preregistered gates.

V1 still does not do that. V2 then removes learned transition dynamics entirely and still stops honestly at Gate 9: the fixed causal substrate is programmable for some tasks, but not broadly enough under the frozen benchmark. V3 separately proves that local legality can coexist with global closure failure, while its first detector also remains red.
