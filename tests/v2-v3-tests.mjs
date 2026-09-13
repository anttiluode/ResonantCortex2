import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeRng } from '../src/prng.js';
import { evaluateGates } from '../src/metrics.js';
import { makeDefaultSubstrate, stepSubstrate, serializeSubstrate } from '../src/causal_substrate.js';
import { CONTROL_TASKS, makeControlInstance, runControlPolicy } from '../src/control_tasks.js';
import { randomControlPolicy } from '../src/control_policy.js';
import { searchControlEvolution, searchControlAnneal } from '../src/control_search.js';
import { compressControls, routeControlMotif } from '../src/control_compress.js';
import { executeControlMotifs } from '../src/control_execute.js';
import { runV2V3Experiment } from '../src/v2_experiment.js';
import { calibrateClosureMonitor, evaluateClosureMonitor } from '../src/global_consistency.js';

function makeSyntheticV2Report(){
  const tasks={};
  for(const id of ['toggle','delay','pattern','switch']) tasks[id]={
    search:{score:.90,exact:.85,noControlScore:.60,evolutionHasSuccess:true,annealHasSuccess:true},
    compiled:{score:.83,exact:.82,globalScore:.70,globalExact:.64,searchEvaluationsAtInference:0,unknownRate:.05,motifCount:3,usedMotifs:2},
    horizon:{h1:.04,h8:.09,earlyAbstentionRate:.05}
  };
  return {
    tasks:{},
    causalControl:{
      substrateIntegrity:{finiteRate:1,convergenceRate:.999,deterministic:true,controlPerturbs:true,immutable:true,directOverwriteImpossible:true},
      tasks
    },
    globalConsistency:{
      episodes:[{name:'L2',localLegal:true,allConverged:true,boundsOk:true,closureError:.20}],
      monitor:{badRecall:.95,falsePositiveRate:.05,usesTaskLabels:false}
    }
  };
}

// V2 Task 1: fixed causal substrate integrity.
{
  const substrate=makeDefaultSubstrate();
  const frozen=serializeSubstrate(substrate);
  const x0=Array(substrate.n).fill(0);
  const zero=stepSubstrate(substrate,x0,[0,0,0]);
  const pert=stepSubstrate(substrate,x0,[0.4,0,0]);
  assert.ok(zero.state.every(Number.isFinite));
  assert.ok(pert.state.every(Number.isFinite));
  assert.notDeepEqual(pert.state,zero.state,'bounded control must change next state');
  assert.deepEqual(serializeSubstrate(substrate),frozen,'substrate mutated during step');
  assert.ok(pert.current.every(Number.isFinite));
  assert.equal(typeof pert.converged,'boolean');

  const controls=Array.from({length:64},(_,i)=>[
    Math.sin(i*0.31)*0.8,
    Math.cos(i*0.17)*0.7,
    Math.sin(i*0.11+0.4)*0.6
  ]);
  function replay(){
    let x=Array(substrate.n).fill(0); const out=[];
    for(const u of controls){ const s=stepSubstrate(substrate,x,u); assert.ok(s.converged); x=s.state; out.push(x.slice()); }
    return out;
  }
  assert.equal(JSON.stringify(replay()),JSON.stringify(replay()),'deterministic replay changed');

  let x=Array(substrate.n).fill(0), converged=0;
  for(let i=0;i<2000;i++){
    const u=[Math.sin(i)*1.4,Math.cos(i*.37)*1.2,Math.sin(i*.13)*1.6];
    const r=stepSubstrate(substrate,x,u); if(r.converged) converged++;
    assert.ok(r.state.every(Number.isFinite));
    assert.ok(r.control.every(v=>v>=-1&&v<=1),'control was not clipped');
    x=r.state;
  }
  assert.ok(converged/2000>=0.999,'implicit solve convergence below gate floor');
}
console.log('V2 causal substrate tests passed');

// V2 Task 2: temporal tasks, bounded policies, and final-score-only search.
{
  assert.deepEqual(Object.keys(CONTROL_TASKS).sort(),['delay','pattern','switch','toggle']);
  const s1=makeControlInstance('toggle',makeRng(101),'search');
  const s2=makeControlInstance('toggle',makeRng(101),'search');
  assert.deepEqual(s1,s2);
  const e=makeControlInstance('toggle',makeRng(101),'eval');
  assert.ok(e.length>s1.length,'held-out toggle should be longer');
  const ds=makeControlInstance('delay',makeRng(202),'search');
  const de=makeControlInstance('delay',makeRng(202),'eval');
  assert.ok(de.delay>ds.delay,'held-out delay should be longer');

  const substrate=makeDefaultSubstrate();
  const p=randomControlPolicy(substrate.n,3,makeRng(7),3);
  const r=runControlPolicy({taskId:'delay',instance:ds,policy:p,substrate});
  assert.equal(r.trajectory.length,r.controls.length+1);
  assert.equal(r.controls.length,r.inputs.length);
  assert.ok(r.controls.every(u=>u.length===3));
  assert.ok(Number.isFinite(r.score));

  for(const search of [searchControlEvolution,searchControlAnneal]){
    const a=search({taskId:'delay',seed:71,budget:30,instances:5,substrate});
    const b=search({taskId:'delay',seed:71,budget:30,instances:5,substrate});
    assert.equal(a.bestScore,b.bestScore);
    assert.equal(a.evaluations,30);
    assert.deepEqual(a.bestTraces,b.bestTraces);
    for(const t of a.bestTraces){
      assert.ok(t.instance && t.taskId==='delay');
      assert.equal(t.states.length,t.controls.length+1);
      assert.equal(t.inputs.length,t.controls.length);
      assert.equal('targetStates' in t,false,'search trace leaked oracle target states');
    }
  }
}
console.log('V2 control task/search tests passed');

// V2 Task 3: compress successful controls, never next states.
{
  const samples=[];
  for(let i=0;i<120;i++){
    const x=i/30-2;
    const state=Array(9).fill(0); state[0]=x;
    const input=[0,0,0];
    const control=x<0?[-0.8,0.15,0.05]:[0.75,-0.10,0.10];
    samples.push({state,input,control,solver:i%2?'evolution':'anneal',taskId:'synthetic',traceScore:1});
  }
  const comp=compressControls(samples,{maxMotifs:4,validationFraction:.25,seed:8});
  assert.ok(comp.motifs.length>=2,`expected multiple control motifs, got ${comp.motifs.length}`);
  assert.ok(comp.validation.mseMotifs<comp.validation.mseGlobal,`${comp.validation.mseMotifs} !< ${comp.validation.mseGlobal}`);
  const far=Array(9).fill(100);
  assert.equal(routeControlMotif(comp.motifs,far,[0,0,0]),null);

  const substrate=makeDefaultSubstrate();
  const inst=makeControlInstance('delay',makeRng(55),'search');
  const run=executeControlMotifs({taskId:'delay',instance:inst,motifs:comp.motifs,substrate});
  assert.ok(run.trajectory.length>=1);
  assert.equal(run.trajectory.length,run.controls.length+1);
  assert.ok(run.route.every(r=>r.modeId==='UNKNOWN'||Number.isInteger(r.modeId)));
}
console.log('V2 control compression tests passed');

// V2 Task 4: Gates 8-11 have fixed boundaries.
{
  const report=makeSyntheticV2Report();
  const g=evaluateGates(report);
  for(const id of ['gate8','gate9','gate10','gate11','gate12','gate13']) assert.equal(g[id].pass,true,`${id} should pass`);

  const fail8=structuredClone(report); fail8.causalControl.substrateIntegrity.convergenceRate=.9989;
  assert.equal(evaluateGates(fail8).gate8.pass,false);
  const fail9=structuredClone(report); for(const id of ['toggle','delay']) fail9.causalControl.tasks[id].search.score=.84;
  assert.equal(evaluateGates(fail9).gate9.pass,false);
  const fail10=structuredClone(report); for(const id of ['toggle','delay','pattern']) fail10.causalControl.tasks[id].compiled.score=.80;
  assert.equal(evaluateGates(fail10).gate10.pass,false);
  const fail11=structuredClone(report); for(const id of ['toggle','delay','pattern']) fail11.causalControl.tasks[id].horizon.h8=.11;
  assert.equal(evaluateGates(fail11).gate11.pass,false);
}
console.log('V2/V3 gate boundary tests passed');

// V2 Task 4b: end-to-end causal-control report assembly.
{
  const report=runV2V3Experiment({seed:31,v1Budget:24,controlBudget:24,controlInstances:5,controlEvalCount:8,evalScale:'smoke',includeV3:false});
  assert.equal(report.engineering.receiptSchemaVersion,3);
  assert.ok(report.causalControl?.substrateIntegrity);
  assert.deepEqual(Object.keys(report.causalControl.tasks).sort(),['delay','pattern','switch','toggle']);
  for(const [id,t] of Object.entries(report.causalControl.tasks)){
    assert.ok(Number.isFinite(t.search.score),`${id}: missing search score`);
    assert.ok(Number.isFinite(t.compiled.score),`${id}: missing compiled score`);
    assert.ok(Number.isFinite(t.horizon.h1),`${id}: missing h1`);
    assert.ok(Number.isFinite(t.horizon.h8),`${id}: missing h8`);
  }
  for(const id of ['gate8','gate9','gate10','gate11']) assert.ok(report.gates[id]);
}
console.log('V2 experiment integration tests passed');

// V3: monitor calibration and end-to-end loop evidence.
{
  const calibration=[
    {label:'good',readoutClosure:0.01,invariantClosure:0.02},
    {label:'good',readoutClosure:0.02,invariantClosure:0.03},
    {label:'good',readoutClosure:0.03,invariantClosure:0.04},
    {label:'bad',readoutClosure:0.20,invariantClosure:0.26},
    {label:'bad',readoutClosure:0.24,invariantClosure:0.31}
  ];
  const monitor=calibrateClosureMonitor(calibration);
  const heldout=[
    {label:'good',readoutClosure:0.02,invariantClosure:0.03},
    {label:'good',readoutClosure:0.03,invariantClosure:0.04},
    {label:'bad',readoutClosure:0.18,invariantClosure:0.23},
    {label:'bad',readoutClosure:0.25,invariantClosure:0.33}
  ];
  const ev=evaluateClosureMonitor(monitor,heldout);
  assert.equal(ev.badRecall,1);
  assert.equal(ev.falsePositiveRate,0);
  assert.equal(ev.usesTaskLabels,false);

  const report=runV2V3Experiment({seed:41,v1Budget:12,controlBudget:12,controlInstances:4,controlEvalCount:5,evalScale:'smoke',includeV3:true});
  assert.ok(Array.isArray(report.globalConsistency.episodes));
  assert.ok(report.globalConsistency.episodes.length>=3);
  assert.ok(Number.isFinite(report.globalConsistency.monitor.threshold));
  assert.equal(report.globalConsistency.monitor.usesTaskLabels,false);
  assert.ok(report.gates.gate12 && report.gates.gate13);
}
console.log('V3 global consistency tests passed');

// Pages + committed receipt expose V2/V3 while keeping V0/V1.
{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  for(const id of ['v2-gates','v2-task-table','v2-motif-view','v2-horizon-view','v3-loop-table','v3-monitor-summary']){
    assert.ok(html.includes(`id="${id}"`),`missing V2/V3 UI id ${id}`);
  }
  const receipt=JSON.parse(fs.readFileSync(new URL('../results/default.json',import.meta.url),'utf8'));
  assert.equal(receipt.engineering.receiptSchemaVersion,3);
  assert.ok(receipt.causalControl && receipt.globalConsistency);
  for(const id of ['gate8','gate9','gate10','gate11','gate12','gate13']){
    assert.equal(typeof receipt.gates[id]?.pass,'boolean',`missing ${id}`);
    assert.ok('evidence' in receipt.gates[id],`${id} missing evidence`);
  }
}
console.log('V2/V3 page and receipt tests passed');
