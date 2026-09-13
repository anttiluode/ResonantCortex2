# ResonantCortex2 V1 — Computation Autopsy and Successor Routing

## Purpose

V0 found a specific partial result: searched trajectories contain reusable local/cross-solver structure, but the frozen mode bank does not yet execute useful held-out algorithms. V1 must explain **where autonomy dies** before adding more search capacity.

The V0 Gates 0–5 and their thresholds remain unchanged. V1 adds two new experimental questions without rewriting the original result.

## Key Hypothesis

A reusable local operator is not yet an instruction. An instruction needs:

1. a source applicability region,
2. a local transition,
3. evidence that the transition lands in a state where a viable successor computation can continue.

A self-sustaining algorithm may therefore be a **closed chain of locally valid operators** rather than a bag of locally accurate transforms.

## Important Measurement Correction

V0 transition NMSE is measured over the entire task state. Several state coordinates are overwritten by the external task environment every step, so low whole-state NMSE can overstate how well the learned modes predict the autonomous/writable part of the computation.

V1 reports errors separately on:

- **all state dimensions**, for continuity with V0,
- **endogenous dimensions**, the coordinates not overwritten by `applyEnvironment`.

Endogenous dimensions are fixed by task:

- `mandelbrot`: `[0,1,5,6]`
- `gcd`: `[2,3,4,6]`
- `sort4`: `[4,5,6,7]`
- `parity`: `[1,5,6]`

This is diagnostic only; V0 Gate 0 is not retroactively changed.

## Gate 6 — Computation Autopsy

For each successful searched trace retained by the compressor, V1 compares four conditions using the **same frozen mode bank**.

### A. Teacher-state routed one-step

At each true searched state `s_t`, use the normal source-geometry router to choose a mode and predict only `s_{t+1}`. Apply the task environment exactly once, then compare with the true next state.

This measures whether a mode can make a good local step when it is repeatedly returned to the true trajectory.

### B. Frozen teacher-route replay

First record the mode sequence chosen in A on the true states. Then start only from the true `s_0` and replay that fixed mode sequence open-loop. No later true state is supplied.

If A is good but B drifts, the dominant failure is accumulated operator error / unstable composition rather than route selection.

### C. Free routing

Run the existing autonomous top-1 source-state router from `s_0` and compare its predicted states with the true trace at horizons `1,2,4,8,16,32` where available.

If B remains close while C diverges, route recovery is the dominant failure.

### D. Oracle-best existing mode diagnostic

For diagnosis only, at every true `s_t`, choose the **existing frozen mode** whose one-step prediction best matches the true `s_{t+1}` on endogenous dimensions. This does not create a new operator and is never used as evidence of autonomous execution.

The oracle sequence is also replayed open-loop. If even oracle one-step prediction is poor, the mode vocabulary/compression is inadequate.

## Autopsy Metrics

At each supported horizon report:

- safety-normalized RMSE across all state dimensions,
- safety-normalized RMSE on endogenous dimensions,
- minimum source-manifold residual normalized by the selected mode threshold,
- fraction of traces still inside at least one learned applicability region,
- `UNKNOWN` rate for free routing.

For each task report mean teacher one-step endogenous error and the replay/free/oracle-replay horizon curves.

Gate 6 is a **diagnostic PASS**, not a claim of algorithm discovery. It passes when at least one task with >= 8 eligible successful transitions shows a measurable autonomy gap: teacher one-step endogenous error <= 0.10 and either replay or free-routing endogenous error at horizon >= 4 is at least 2x the teacher one-step error. The report must name the dominant observed failure as `operator_vocabulary`, `accumulation`, `routing`, or `mixed` using fixed rules in code.

## Successor Graph

After compression is frozen, map every successful searched trace to its nearest learned mode at each true state. Learn only counts/probabilities of observed mode-to-mode succession; solver identity is not a routing feature.

A successor graph stores:

- count `N(i -> j)`,
- smoothed probability `P(j | i)`,
- source/next mode support counts.

No reference algorithm or human operation name enters the graph.

## Gate 7 — Successor-Consistent Routing

Add an experimental router that scores candidate current mode `i` by both present fit and predicted continuation.

For current state `s`:

```text
sourceCost(i) = R_i(s) / theta_i
predicted      = environment(A_i s + b_i)
destCost(i)    = min_j R_j(predicted) / theta_j
priorCost(i)   = -log(P(j* | i) + eps)
continuationCost(i) = sourceCost + lambda * destCost + eta * priorCost
```

where `j*` is the best supported successor for the predicted state. Default constants are fixed in V1: `lambda = 0.75`, `eta = 0.10`, current source tolerance `1.25 * theta`, destination tolerance `1.50 * theta`, Laplace smoothing `alpha = 0.5`.

If the predicted state is terminal, no successor is required and destination/prior cost are zero.

The V0 source-only router remains available as an unchanged baseline.

Gate 7 passes only if successor routing, on held-out execution:

- improves task score by at least **0.10 absolute** over V0 source-only routing on at least one task,
- does not reduce that task below the global-transform baseline by more than 0.02 if source-only was already above global,
- and reduces either `UNKNOWN` rate or horizon-8 endogenous rollout error by at least **20%** on that same task.

A Gate 7 failure is retained as evidence that one-step lookahead/successor statistics are insufficient.

## Data Integrity

- Search still receives final task score only.
- Reference next states are used only inside Gate 6 diagnostics after search/compression is frozen.
- Oracle-best mode is diagnostic only and cannot influence compression, successor graph fitting, or held-out routing.
- Successor graph uses successful searched traces, never reference algorithm traces.
- Existing known-law Mandelbrot control remains visibly separate.

## UI

Add a `Computation Autopsy` section for the selected task showing:

- horizon table for teacher one-step, fixed-route replay, free routing, and oracle replay,
- endogenous vs all-state error,
- manifold survival / UNKNOWN rate,
- dominant failure classification,
- Gate 6 status.

Add a `Successor Routing` section showing:

- source-only held-out score,
- successor-routing held-out score,
- global score,
- learned mode-transition graph as compact `Mi -> Mj` chips with probabilities,
- one selected route with predicted successor and continuation cost,
- Gate 7 status.

The UI must continue to show Gates 0–5 unchanged.

## Receipt / CI

Increment receipt schema version to 2. The deterministic receipt includes `autopsy`, `successorGraph`, `successorExecution`, Gate 6, and Gate 7 evidence per task. Scientific failures never make CI red. Engineering tests verify deterministic diagnostics, no non-finite metrics, fixed thresholds, and that successor routing never reads reference next states.
