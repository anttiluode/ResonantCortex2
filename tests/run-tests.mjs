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
console.log('Task 1 core tests passed');

import { randomProgram, runProgram } from '../src/operators.js';
import { searchEvolution, searchAnneal } from '../src/search.js';

{
  const rng = makeRng(91);
  const p = randomProgram(8, rng, 3);
  const inst = makeInstance('gcd', makeRng(2), 'search');
  const run = runProgram(p, 'gcd', inst, 12);
  assert.ok(run.trace.length <= 13);
  assert.ok(Number.isFinite(run.score));
  for (const search of [searchEvolution, searchAnneal]) {
    const r1 = search({taskId:'parity', seed:44, budget:40, instances:8, programSteps:2});
    const r2 = search({taskId:'parity', seed:44, budget:40, instances:8, programSteps:2});
    assert.equal(r1.bestScore, r2.bestScore);
    assert.equal(r1.evaluations, 40);
    assert.ok(r1.successfulTraces.length > 0);
    assert.ok(r1.successfulTraces.every(t=>t.score>=0.8),'compressor received a non-successful trace');
  }
}
console.log('Task 2 search tests passed');

import { compressTransitions } from '../src/compress.js';
import { routeMode } from '../src/executor.js';
{
  const transitions=[];
  for(let i=0;i<80;i++){
    const x=i/20-2;
    const state=[x,1];
    const next=x<0?[x+1,1]:[2*x,1];
    transitions.push({state,next,solver:i%2?'evolution':'anneal'});
  }
  const comp=compressTransitions(transitions,{maxModes:4,validationFraction:.25,seed:5});
  assert.ok(comp.modes.length>=2, `expected >=2 modes, got ${comp.modes.length}`);
  assert.ok(comp.validation.nmseModes < comp.validation.nmseGlobal, `${comp.validation.nmseModes} !< ${comp.validation.nmseGlobal}`);
  assert.equal(routeMode(comp.modes,[100,1]),null);
}
console.log('Task 3 compression tests passed');

import { pearson, evaluateGates } from '../src/metrics.js';
import { interpretMode } from '../src/interpreter.js';

function makeSyntheticPassingReport(){
  const baseDiscrete=(name)=>({
    compression:{nmseModes:0.50,nmseGlobal:1.0,modeCount:3},
    execution:{compiledExact:0.90,globalExact:0.60,compiledScore:0.92,globalScore:0.62,searchOnlyScore:0.95,searchCandidateEvaluations:4000,compiledOperations:100,searchOnlyComplete:true},
    ablation:{routedScore:0.92,disabledScore:0.65,routedExact:0.90,disabledExact:0.60},
    crossSolver:{shared:true,fidelityRatio:0.90},
    interpretation:{bestR2:name==='gcd'?0.99:0.70,probeCount:1000}
  });
  return {tasks:{
    gcd:baseDiscrete('gcd'),
    sort4:baseDiscrete('sort4'),
    parity:{...baseDiscrete('parity'),compression:{nmseModes:0.60,nmseGlobal:1.0,modeCount:2}},
    mandelbrot:{
      compression:{nmseModes:0.70,nmseGlobal:1.0,modeCount:5},
      execution:{mandelbrotCorr:0.93,mandelbrotNmae:0.10,compiledScore:0.91,globalScore:0.50,searchOnlyScore:0.95,searchCandidateEvaluations:4000,compiledOperations:100,searchOnlyComplete:true},
      ablation:{routedScore:0.91,disabledScore:0.60,routedExact:0,disabledExact:0},
      crossSolver:{shared:true,fidelityRatio:0.85},
      interpretation:{bestR2:0.6,probeCount:1000}
    }
  }};
}
{
  assert.ok(Math.abs(pearson([1,2,3],[2,4,6])-1)<1e-12);
  const gates=evaluateGates(makeSyntheticPassingReport());
  for(const k of ['gate0','gate1','gate2','gate3','gate4','gate5']) assert.equal(gates[k].pass,true,`${k} should pass`);
  const fail0=makeSyntheticPassingReport();
  for(const id of ['gcd','sort4','parity']) fail0.tasks[id].compression.nmseModes=.76;
  assert.equal(evaluateGates(fail0).gate0.pass,false);
  const fail5=makeSyntheticPassingReport(); fail5.tasks.gcd.interpretation.bestR2=.979;
  assert.equal(evaluateGates(fail5).gate5.pass,false);
  const fail2=makeSyntheticPassingReport(); fail2.tasks.gcd.execution.searchOnlyComplete=false;
  assert.equal(evaluateGates(fail2).gate2.pass,false);

  const identity={id:0,A:[[1,0],[0,1]],b:[0,0],prototype:[0,0],scale:[1,1],threshold:3};
  const probes=Array.from({length:1000},(_,i)=>[(i%31)/15-1,(i%17)/8-1]);
  const interp=interpretMode(identity,probes);
  assert.ok(interp.bestR2>.999999);
}
console.log('Task 4 metric/interpreter tests passed');

import { runExperiment } from '../src/experiment.js';
{
  const report=runExperiment({seed:17,budget:24,instances:5,evalScale:'smoke',searchOnlySample:0});
  assert.equal(report.config.seed,17);
  assert.deepEqual(Object.keys(report.tasks).sort(),['gcd','mandelbrot','parity','sort4']);
  for(const task of Object.values(report.tasks)){
    assert.ok(Number.isFinite(task.search.evolution.bestScore));
    assert.ok(task.compression.modeCount<=12);
    assert.ok(Number.isFinite(task.execution.compiledScore));
  }
  assert.ok(report.gates && report.controls.mandelbrotImitation);
  assert.equal(report.controls.mandelbrotImitation.evidenceType,'teacher-forced control');
}
console.log('Task 5 experiment smoke test passed');

import fs from 'node:fs';
{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  for(const id of ['run-search','compress','execute','task-select','mode-grid','route-view','truth-canvas','compiled-canvas','gate-grid','engineering-status','autopsy-table','autopsy-summary','successor-edges','successor-score','successor-route']){
    assert.ok(html.includes(`id="${id}"`),`missing UI id ${id}`);
  }
  assert.equal(/<script[^>]+src=["']http/i.test(html),false);
  assert.equal(/<link[^>]+href=["']http/i.test(html),false);
}
console.log('Task 6 UI integrity tests passed');

{
  const receipt=JSON.parse(fs.readFileSync(new URL('../results/default.json',import.meta.url),'utf8'));
  assert.equal(receipt.engineering.receiptSchemaVersion,2);
  for(const k of ['engineering','config','tasks','baselines','gates','controls']) assert.ok(k in receipt,`receipt missing ${k}`);
  for(const k of ['gate6','gate7']) assert.ok(k in receipt.gates,`receipt missing ${k}`);
  for(const [k,g] of Object.entries(receipt.gates)){
    assert.equal(typeof g.pass,'boolean',`${k}.pass not boolean`);
    assert.ok('evidence' in g,`${k}.evidence missing`);
  }
  function finiteNumbers(x,path='root'){
    if(typeof x==='number') assert.ok(Number.isFinite(x),`non-finite number at ${path}`);
    else if(Array.isArray(x)) x.forEach((v,i)=>finiteNumbers(v,`${path}[${i}]`));
    else if(x && typeof x==='object') for(const [k,v] of Object.entries(x)) finiteNumbers(v,`${path}.${k}`);
  }
  finiteNumbers(receipt);
}
console.log('Task 7 receipt schema tests passed');

import { autopsyTrace, summarizeAutopsy, ENDOGENOUS_DIMS } from '../src/autopsy.js';
{
  const sr=searchEvolution({taskId:'parity',seed:51,budget:24,instances:5,programSteps:2});
  assert.ok(sr.bestTraces.every(t=>t.instance && t.instance.taskId==='parity'),'searched traces must retain their input instance');
  assert.deepEqual(ENDOGENOUS_DIMS.mandelbrot,[0,1,5,6]);

  const I=Array.from({length:8},(_,i)=>Array.from({length:8},(_,j)=>i===j?1:0));
  const b0=Array(8).fill(0); b0[1]=0.25;
  const b1=Array(8).fill(0);
  const modeA={id:0,A:I.map(r=>r.slice()),b:b0,prototype:Array(8).fill(0),scale:Array(8).fill(2),threshold:3};
  const modeB={id:1,A:I.map(r=>r.slice()),b:b1,prototype:[0,1,0,0,0,0,0,1],scale:Array(8).fill(2),threshold:3};
  const states=[];
  for(let t=0;t<5;t++){ const s=Array(8).fill(0); s[1]=0.25*t; s[7]=1; states.push(s); }
  const synthetic={taskId:'parity',solver:'evolution',score:1,instance:{taskId:'parity',bits:[0,0,0,0,0],length:5,truth:0},states};
  const a=autopsyTrace({taskId:'parity',trace:synthetic,modes:[modeA,modeB],globalMode:modeA,applyEnvironmentFn:(id,inst,s)=>s});
  assert.equal(a.teacherOneStep.steps.length,4);
  assert.equal(a.fixedReplay.steps.length,4);
  assert.equal(a.oracleOneStep.steps.length,4);
  const summary=summarizeAutopsy('parity',[a]);
  assert.equal(summary.eligibleTransitions,4);
}
console.log('V1 Task 1 autopsy tests passed');

import { buildSuccessorGraph, routeModeSuccessor } from '../src/successor.js';
{
  const I=Array.from({length:8},(_,i)=>Array.from({length:8},(_,j)=>i===j?1:0));
  const b0=Array(8).fill(0); b0[1]=1;
  const z=Array(8).fill(0); z[7]=1;
  const one=z.slice(); one[1]=1;
  const two=z.slice(); two[1]=2;
  const m0={id:0,A:I.map(r=>r.slice()),b:b0,prototype:z.slice(),scale:Array(8).fill(1),threshold:0.6};
  const m1={id:1,A:I.map(r=>r.slice()),b:Array(8).fill(0),prototype:one.slice(),scale:Array(8).fill(1),threshold:0.6};
  const instance={taskId:'gcd',a:10,b:5,truth:5};
  const traceA={taskId:'gcd',solver:'evolution',score:1,instance,states:[z,one,two]};
  const traceB={taskId:'gcd',solver:'anneal',score:1,instance,states:[z,one,one]};
  const graph=buildSuccessorGraph([m0,m1],[traceA,traceB]);
  assert.ok(graph.probs['0']['1'] > graph.probs['0']['0']);
  const pick=routeModeSuccessor({modes:[m0,m1],state:z,taskId:'gcd',instance,step:0,successorGraph:graph,applyEnvironmentFn:(id,inst,s)=>s,isTerminalFn:()=>false});
  assert.equal(pick.mode.id,0);
  assert.equal(pick.expectedSuccessorId,1);
  assert.ok(Number.isFinite(pick.continuationCost));
}
console.log('V1 Task 2 successor routing tests passed');

{
  const pass=makeSyntheticPassingReport();
  pass.tasks.gcd.autopsy={eligibleTransitions:20,teacherOneStepEndogenous:0.04,oracleOneStepEndogenous:0.02,horizons:{4:{fixedEndogenous:0.14,freeEndogenous:0.20,oracleEndogenous:0.05,manifoldSurvival:0.75,unknownRate:0.25,count:8}},dominantFailure:'accumulation'};
  pass.tasks.gcd.successorExecution={score:0.82,sourceOnlyScore:0.68,globalScore:0.65,unknownRate:0.10,sourceOnlyUnknownRate:0.20,horizon8Endogenous:0.12,sourceOnlyHorizon8Endogenous:0.20};
  let g=evaluateGates(pass);
  assert.equal(g.gate6.pass,true,'Gate 6 should pass on a measured autonomy gap');
  assert.equal(g.gate7.pass,true,'Gate 7 should pass on >=0.10 gain plus >=20% continuation improvement');
  const fail6=makeSyntheticPassingReport();
  fail6.tasks.gcd.autopsy={...pass.tasks.gcd.autopsy,teacherOneStepEndogenous:0.11};
  fail6.tasks.gcd.successorExecution=pass.tasks.gcd.successorExecution;
  assert.equal(evaluateGates(fail6).gate6.pass,false,'Gate 6 should fail above teacher one-step threshold');
  const fail7=makeSyntheticPassingReport();
  fail7.tasks.gcd.autopsy=pass.tasks.gcd.autopsy;
  fail7.tasks.gcd.successorExecution={...pass.tasks.gcd.successorExecution,score:0.77};
  assert.equal(evaluateGates(fail7).gate7.pass,false,'Gate 7 should fail below 0.10 score gain');
}
console.log('V1 Task 3 gate tests passed');

{
  const report=runExperiment({seed:23,budget:24,instances:5,evalScale:'smoke',searchOnlySample:0});
  assert.equal(report.engineering.receiptSchemaVersion,2);
  for(const [id,t] of Object.entries(report.tasks)){
    assert.ok(t.autopsy && typeof t.autopsy.dominantFailure==='string',`${id}: missing autopsy`);
    assert.ok(t.successorGraph && Array.isArray(t.successorGraph.edges),`${id}: missing successor graph`);
    assert.ok(t.successorExecution && Number.isFinite(t.successorExecution.score),`${id}: missing successor execution`);
  }
  assert.ok(report.gates.gate6 && report.gates.gate7);
}
console.log('V1 Task 3 experiment integration tests passed');
