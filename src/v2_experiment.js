import { runExperiment } from './experiment.js';
import { makeRng,deriveSeed } from './prng.js';
import { makeDefaultSubstrate,stepSubstrate,serializeSubstrate } from './causal_substrate.js';
import { CONTROL_TASKS,makeControlInstance,runControlPolicy } from './control_tasks.js';
import { randomControlPolicy } from './control_policy.js';
import { searchControlEvolution,searchControlAnneal } from './control_search.js';
import { controlSamplesFromTraces,compressControls } from './control_compress.js';
import { executeControlMotifs } from './control_execute.js';
import { evaluateGates } from './metrics.js';
import { makeLoopEpisodes,loopMetrics,calibrateClosureMonitor,evaluateClosureMonitor } from './global_consistency.js';

const mean=xs=>xs.reduce((a,b)=>a+b,0)/Math.max(1,xs.length);

function stateDivergence(a,b,safety){
  if(!a||!b||a.length!==b.length) return 1;
  let e=0; for(let i=0;i<a.length;i++) e+=(a[i]-b[i])**2;
  return Math.sqrt(e/a.length)/Math.max(1e-12,safety);
}

function substrateIntegrityEvidence(substrate,seed){
  const before=serializeSubstrate(substrate);
  const rng=makeRng(deriveSeed(seed,'substrate-integrity'));
  let x=Array(substrate.n).fill(0),finite=0,converged=0,total=0;
  const controls=[];
  for(let i=0;i<1200;i++) controls.push(Array.from({length:substrate.nsite},()=>-1+2*rng()));
  for(const u of controls){
    const r=stepSubstrate(substrate,x,u); total++;
    if(r.state.every(Number.isFinite)) finite++;
    if(r.converged) converged++;
    x=r.state;
  }
  function replay(){
    let s=Array(substrate.n).fill(0),out=[];
    for(const u of controls.slice(0,64)){ const r=stepSubstrate(substrate,s,u); s=r.state; out.push(s.slice()); }
    return JSON.stringify(out);
  }
  const z=Array(substrate.n).fill(0);
  const a=stepSubstrate(substrate,z,Array(substrate.nsite).fill(0));
  const b=stepSubstrate(substrate,z,[0.4,0,0]);
  const extra=stepSubstrate(substrate,z,[0.4,0,0],Array(substrate.n).fill(999));
  const controlPerturbs=JSON.stringify(a.state)!==JSON.stringify(b.state);
  const immutable=JSON.stringify(before)===JSON.stringify(serializeSubstrate(substrate));
  const directOverwriteImpossible=JSON.stringify(extra)===JSON.stringify(b);
  return {
    finiteRate:finite/total,
    convergenceRate:converged/total,
    deterministic:replay()===replay(),
    controlPerturbs,immutable,directOverwriteImpossible,
    stressSteps:total,
    substrate:{n:substrate.n,nsite:substrate.nsite,siteNodes:[...substrate.siteNodes],safety:substrate.constants.safety}
  };
}

function evalInstances(taskId,seed,count){
  const rng=makeRng(deriveSeed(seed,`${taskId}:control-heldout`));
  return Array.from({length:count},()=>makeControlInstance(taskId,rng,'eval'));
}

function evalDirectPolicy(taskId,instances,policy,substrate){
  const runs=instances.map(instance=>runControlPolicy({taskId,instance,policy,substrate}));
  return {score:mean(runs.map(r=>r.score)),exact:mean(runs.map(r=>r.exact?1:0)),runs};
}

function evalCompiled(taskId,instances,motifs,substrate,globalMap,samples){
  const evalRoute=routing=>instances.map(instance=>executeControlMotifs({taskId,instance,motifs,substrate,globalMap,routing,nearestSamples:samples}));
  const motif=motifs.length?evalRoute('motif'):evalRoute('zero');
  const global=globalMap?evalRoute('global'):evalRoute('zero');
  const nearest=samples.length?evalRoute('nearest'):evalRoute('zero');
  const zero=evalRoute('zero');
  const aggregate=runs=>({score:mean(runs.map(r=>r.score)),exact:mean(runs.map(r=>r.exact?1:0)),unknownRate:mean(runs.map(r=>r.unknown?1:0))});
  const used=new Set();
  for(const r of motif) for(const x of r.route) if(Number.isInteger(x.modeId)) used.add(x.modeId);
  return {motif,global,nearest,zero,motifAgg:aggregate(motif),globalAgg:aggregate(global),nearestAgg:aggregate(nearest),zeroAgg:aggregate(zero),usedMotifs:[...used].sort((a,b)=>a-b)};
}

function horizonEvidence(taskId,instances,bestPolicy,motifs,substrate,globalMap,samples){
  const h1=[],h8=[]; let abstain=0;
  for(const instance of instances){
    const ref=runControlPolicy({taskId,instance,policy:bestPolicy,substrate});
    const run=motifs.length?executeControlMotifs({taskId,instance,motifs,substrate,globalMap,routing:'motif',nearestSamples:samples}):executeControlMotifs({taskId,instance,motifs,substrate,globalMap,routing:'zero',nearestSamples:samples});
    if(run.unknown) abstain++;
    const i1=Math.min(1,ref.trajectory.length-1);
    const i8=Math.min(8,ref.trajectory.length-1);
    h1.push(run.trajectory.length>i1?stateDivergence(run.trajectory[i1],ref.trajectory[i1],substrate.constants.safety):1);
    h8.push(run.trajectory.length>i8?stateDivergence(run.trajectory[i8],ref.trajectory[i8],substrate.constants.safety):1);
  }
  return {h1:mean(h1),h8:mean(h8),earlyAbstentionRate:abstain/instances.length,count:instances.length};
}

function taskExperiment(taskId,cfg,substrate){
  const evo=searchControlEvolution({taskId,seed:deriveSeed(cfg.seed,`${taskId}:v2-evo`),budget:cfg.controlBudget,instances:cfg.controlInstances,substrate});
  const ann=searchControlAnneal({taskId,seed:deriveSeed(cfg.seed,`${taskId}:v2-ann`),budget:cfg.controlBudget,instances:cfg.controlInstances,substrate});
  const bestSearch=evo.bestScore>=ann.bestScore?{solver:'evolution',policy:evo.bestPolicy,trainScore:evo.bestScore}:{solver:'anneal',policy:ann.bestPolicy,trainScore:ann.bestScore};
  const successful=[...evo.successfulTraces,...ann.successfulTraces];
  const samples=controlSamplesFromTraces(successful);
  let comp={motifs:[],globalMap:null,validation:{mseMotifs:1,mseGlobal:1,count:0}};
  if(samples.length>=6){
    comp=compressControls(samples,{maxMotifs:12,validationFraction:.25,seed:deriveSeed(cfg.seed,`${taskId}:control-compress`)});
  }
  const heldout=evalInstances(taskId,cfg.seed,cfg.controlEvalCount);
  const searchEval=evalDirectPolicy(taskId,heldout,bestSearch.policy,substrate);
  const base=evalCompiled(taskId,heldout,comp.motifs,substrate,comp.globalMap,samples);
  const randomPolicy=randomControlPolicy(substrate.n,3,makeRng(deriveSeed(cfg.seed,`${taskId}:random-policy`)),substrate.nsite,3);
  const randomEval=evalDirectPolicy(taskId,heldout,randomPolicy,substrate);
  const horizon=horizonEvidence(taskId,heldout,bestSearch.policy,comp.motifs,substrate,comp.globalMap,samples);
  return {
    search:{
      score:searchEval.score,exact:searchEval.exact,noControlScore:base.zeroAgg.score,
      selectedSolver:bestSearch.solver,selectedTrainScore:bestSearch.trainScore,
      evolutionBest:evo.bestScore,annealBest:ann.bestScore,
      evolutionHasSuccess:evo.successfulTraces.length>0,annealHasSuccess:ann.successfulTraces.length>0,
      evaluations:evo.evaluations+ann.evaluations
    },
    compression:{available:samples.length>=6,successfulTraceCount:successful.length,sampleCount:samples.length,motifCount:comp.motifs.length,mseMotifs:comp.validation.mseMotifs,mseGlobal:comp.validation.mseGlobal},
    compiled:{
      score:base.motifAgg.score,exact:base.motifAgg.exact,
      globalScore:base.globalAgg.score,globalExact:base.globalAgg.exact,
      nearestScore:base.nearestAgg.score,nearestExact:base.nearestAgg.exact,
      zeroScore:base.zeroAgg.score,zeroExact:base.zeroAgg.exact,
      randomScore:randomEval.score,randomExact:randomEval.exact,
      searchEvaluationsAtInference:0,unknownRate:base.motifAgg.unknownRate,
      motifCount:comp.motifs.length,usedMotifs:base.usedMotifs.length,
      usedMotifIds:base.usedMotifs,
      representativeRoute:base.motif[0]?.route?.slice(0,16)??[]
    },
    horizon,
    motifs:comp.motifs.map(m=>({id:m.id,threshold:m.threshold,count:m.count,trainSolvers:m.trainSolvers})),
    representative:{target:heldout[0]?.target,searchReadout:searchEval.runs[0]?.readout,compiledReadout:base.motif[0]?.readout,globalReadout:base.global[0]?.readout}
  };
}

export function runV2V3Experiment(config={}){
  const cfg={seed:17,v1Budget:120,controlBudget:config.evalScale==='smoke'?40:400,controlInstances:10,controlEvalCount:config.evalScale==='smoke'?12:32,evalScale:'receipt',includeV3:false,...config};
  const report=runExperiment({seed:cfg.seed,budget:cfg.v1Budget,instances:Math.min(10,cfg.controlInstances),evalScale:cfg.evalScale==='smoke'?'smoke':'receipt',searchOnlySample:0});
  const substrate=makeDefaultSubstrate();
  const tasks={};
  for(const taskId of Object.keys(CONTROL_TASKS)) tasks[taskId]=taskExperiment(taskId,cfg,substrate);
  report.engineering={...report.engineering,version:3,receiptSchemaVersion:3};
  report.causalControl={
    substrateIntegrity:substrateIntegrityEvidence(substrate,cfg.seed),
    tasks,
    outOfFamily:{historicalTaskIds:Object.keys(report.tasks),gating:false},
    config:{controlBudget:cfg.controlBudget,controlInstances:cfg.controlInstances,controlEvalCount:cfg.controlEvalCount,primaryTaskIds:Object.keys(CONTROL_TASKS)}
  };
  if(cfg.includeV3){
    const loops=makeLoopEpisodes({substrate,seed:cfg.seed});
    const monitor=calibrateClosureMonitor(loops.calibration);
    const heldout=evaluateClosureMonitor(monitor,loops.heldout);
    report.globalConsistency={
      episodes:loops.probes.map(loopMetrics),
      monitor:{...monitor,...heldout},
      calibration:{good:loops.calibration.filter(e=>e.label==='good').length,bad:loops.calibration.filter(e=>e.label==='bad').length},
      heldout:{good:loops.heldout.filter(e=>e.label==='good').length,bad:loops.heldout.filter(e=>e.label==='bad').length}
    };
  } else report.globalConsistency={status:'not-run',gating:false};
  report.gates=evaluateGates(report);
  return report;
}
