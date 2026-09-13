# ResonantCortex2 — Algorithm Search Lab

**Status: working V0 laboratory; algorithm compilation is _not yet demonstrated_.**

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

## Four V0 tasks

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

### Selected current numbers

| Task | qualifying traces | modes | local NMSE | global NMSE | compiled score | global score | exact / Mandelbrot metric |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Mandelbrot | 15 | 3 | 0.00393 | 0.01315 | 0.476 | 0.705 | corr 0.119, normalized MAE 0.524 |
| GCD | 3 | 2 | 0.00145 | 0.00086 | 0.021 | 0.021 | exact 0.021 |
| Sort 4 | 3 | 2 | ~0 | ~0 | 0.367 | 0.408 | exact 0.000 |
| Parity | 13 | 1 | 0.44268 | 0.44268 | 0.557 | 0.573 | exact 0.469 |

The interesting failure is clear: **some searched trajectories contain locally compressible and cross-solver structure, but fitting those fragments does not yet produce a useful autonomous recurrent program.** The current bottleneck is composition/routing, not merely finding low local transition error.

That distinction is exactly why the project has separate gates.

## Browser lab

`index.html` is a dependency-free GitHub Pages experiment viewer. It exposes:

- deterministic seed and search budget,
- task inspection,
- Gate 0–5 status,
- evolutionary vs annealing search scores,
- local-vs-global compression error,
- discovered mode cards,
- post-hoc names or `UNNAMED`,
- a frozen route sequence with explicit `UNKNOWN`,
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
  executor.js      geometric routing and recurrence
  metrics.js       baselines and preregistered Gates 0–5
  interpreter.js   post-hoc mode probing / naming
  experiment.js    end-to-end experiment orchestration
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

V0 does not do that yet. That failure is the starting point for the next experiment, not something to hide.
