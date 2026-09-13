import { makeRng, deriveSeed, randn } from './prng.js';
import { TASKS, makeInstance, initialState, applyEnvironment, scoreState, exactSuccess, isTerminal, readAnswer, mandelbrotEscape } from './tasks.js';
import { searchEvolution, searchAnneal } from './search.js';
import { transitionsFromTraces, compressTransitions, sourceResidual } from './compress.js';
import { executeModes } from './executor.js';
import { evaluateGates, pearson, normalizedMae, modeParameterCount, trainTinyBaseline, predictTinyBaseline } from './metrics.js';
import { interpretMode, modeStructuralSummary } from './interpreter.js';

const mean=xs=>xs.reduce((a,b)=>a+b,0)/Math.max(1,xs.length);

function identityMode(dim){
  return {id:'global-fallback',A:Array.from({length:dim},(_,i)=>Array.from({length:dim},(_,j)=>i===j?1:0)),b:Array(dim).fill(0),prototype:Array(dim).fill(0),scale:Array(dim).fill(1),threshold:1e9,trainSolvers:[],count:0};
}

function evalInstances(taskId, seed, scale){
  if(taskId==='mandelbrot'){
    const side=scale==='full'?96:scale==='receipt'?24:8;
    const out=[];
    for(let y=0;y<side;y++) for(let x=0;x<side;x++){
      const cr=-2.0+(x+0.5)/side*2.8;
      const ci=-1.2+(y+0.5)/side*2.4;
      out.push({taskId,split:'eval',cr,ci,truthEscape:mandelbrotEscape(cr,ci,32),gridX:x,gridY:y,gridSide:side});
    }
    return out;
  }
  const counts=scale==='full'?{gcd:128,sort4:256,parity:256}:scale==='receipt'?{gcd:48,sort4:64,parity:64}:{gcd:16,sort4:20,parity:20};
  const rng=makeRng(deriveSeed(seed,`${taskId}:eval`));
  return Array.from({length:counts[taskId]},()=>makeInstance(taskId,rng,'eval'));
}

function executeTiny(taskId,instance,model){
  let state=initialState(taskId,instance); const trace=[state.slice()];
  for(let step=0;step<TASKS[taskId].maxSteps;step++){
    state=predictTinyBaseline(model,state);
    state=applyEnvironment(taskId,instance,state,step);
    trace.push(state.slice());
    if(isTerminal(taskId,instance,state,step)) break;
  }
  return {state,trace,score:scoreState(taskId,instance,state,trace),exact:exactSuccess(taskId,instance,state,trace)};
}

function evaluateDiscrete(taskId,instances,modes,globalMode,tiny){
  const compiled=[], global=[], neural=[];
  let compiledOps=0;
  for(const inst of instances){
    const c=executeModes({taskId,instance:inst,modes,globalMode});
    const g=executeModes({taskId,instance:inst,modes,globalMode,routing:'global'});
    const n=executeTiny(taskId,inst,tiny);
    compiledOps+=c.steps;
    compiled.push({score:c.score,exact:exactSuccess(taskId,inst,c.state,c.trace),route:c.route});
    global.push({score:g.score,exact:exactSuccess(taskId,inst,g.state,g.trace)});
    neural.push({score:n.score,exact:n.exact});
  }
  return {
    compiledScore:mean(compiled.map(x=>x.score)),
    globalScore:mean(global.map(x=>x.score)),
    neuralScore:mean(neural.map(x=>x.score)),
    compiledExact:mean(compiled.map(x=>x.exact?1:0)),
    globalExact:mean(global.map(x=>x.exact?1:0)),
    neuralExact:mean(neural.map(x=>x.exact?1:0)),
    compiledOperations:compiledOps,
    sampleRoute:compiled[0]?.route??[]
  };
}

function evaluateMandelbrot(instances,modes,globalMode,tiny){
  const truth=[], compiled=[], global=[], neural=[]; let compiledOps=0;
  for(const inst of instances){
    const c=executeModes({taskId:'mandelbrot',instance:inst,modes,globalMode});
    const g=executeModes({taskId:'mandelbrot',instance:inst,modes,globalMode,routing:'global'});
    const n=executeTiny('mandelbrot',inst,tiny);
    truth.push(inst.truthEscape);
    compiled.push(readAnswer('mandelbrot',inst,c.state,c.trace));
    global.push(readAnswer('mandelbrot',inst,g.state,g.trace));
    neural.push(readAnswer('mandelbrot',inst,n.state,n.trace));
    compiledOps+=c.steps;
  }
  const cn=normalizedMae(compiled,truth,32), gn=normalizedMae(global,truth,32), nn=normalizedMae(neural,truth,32);
  return {
    compiledScore:Math.max(0,1-cn), globalScore:Math.max(0,1-gn), neuralScore:Math.max(0,1-nn),
    mandelbrotCorr:pearson(compiled,truth), mandelbrotNmae:cn,
    globalCorr:pearson(global,truth), globalNmae:gn,
    neuralCorr:pearson(neural,truth), neuralNmae:nn,
    compiledOperations:compiledOps,
    truthEscape:truth, compiledEscape:compiled, globalEscape:global,
    gridSide:instances[0]?.gridSide??0,
    sampleRoute:instances.length?executeModes({taskId:'mandelbrot',instance:instances[Math.floor(instances.length/2)],modes,globalMode}).route:[]
  };
}

function crossSolverEvidence(modes,transitions){
  let best={shared:false,fidelityRatio:0,modeId:null,counts:{}};
  for(const mode of modes){
    const groups={evolution:[],anneal:[]};
    for(const tr of transitions){
      let chosen=mode, bestR=sourceResidual(mode,tr.state);
      for(const m of modes){ const r=sourceResidual(m,tr.state); if(r<bestR){bestR=r;chosen=m;} }
      if(chosen.id===mode.id && groups[tr.solver]) groups[tr.solver].push(tr);
    }
    if(!groups.evolution.length||!groups.anneal.length) continue;
    const fidelity=[];
    for(const solver of ['evolution','anneal']){
      let mse=0,n=0;
      for(const tr of groups[solver]){
        const pred=mode.A.map((row,i)=>row.reduce((s,w,j)=>s+w*tr.state[j],mode.b[i]));
        for(let i=0;i<pred.length;i++){ mse+=(pred[i]-tr.next[i])**2; n++; }
      }
      fidelity.push(1/(1+mse/Math.max(1,n)));
    }
    const ratio=Math.min(...fidelity)/Math.max(...fidelity);
    if(ratio>best.fidelityRatio) best={shared:true,fidelityRatio:ratio,modeId:mode.id,counts:{evolution:groups.evolution.length,anneal:groups.anneal.length}};
  }
  return best;
}

function interpretationEvidence(modes,seed){
  if(!modes.length) return {bestR2:-1,probeCount:0,name:'UNAVAILABLE',modeId:null,modes:[]};
  let best={bestR2:-1,probeCount:1000,name:'UNNAMED',modeId:null};
  const summaries=[];
  for(const mode of modes){
    const rng=makeRng(deriveSeed(seed,`interpret:${mode.id}`));
    const probes=Array.from({length:1000},()=>mode.prototype.map((x,i)=>x+randn(rng)*(mode.scale[i]||0.1)*0.7));
    const interp=interpretMode(mode,probes);
    summaries.push({modeId:mode.id,...interp,...modeStructuralSummary(mode)});
    if(interp.bestR2>best.bestR2) best={modeId:mode.id,...interp};
  }
  return {...best,modes:summaries};
}

export function runMandelbrotImitationControl({side=24}={}){
  const truth=[], control=[];
  for(let y=0;y<side;y++) for(let x=0;x<side;x++){
    const cr=-2.0+(x+0.5)/side*2.8, ci=-1.2+(y+0.5)/side*2.4;
    const t=mandelbrotEscape(cr,ci,32);
    truth.push(t); control.push(t);
  }
  return {evidenceType:'teacher-forced control',label:'KNOWN-LAW CONTROL — not algorithm discovery',correlation:pearson(control,truth),normalizedMae:normalizedMae(control,truth,32),gridSide:side,escape:control};
}

export function runExperiment(config={}){
  const cfg={seed:17,budget:config.evalScale==='full'?4000:120,instances:12,evalScale:'smoke',searchOnlySample:0,maxModes:12,...config};
  const tasks={}; const baselines={};
  for(const taskId of ['mandelbrot','gcd','sort4','parity']){
    const programSteps=taskId==='sort4'?3:2;
    const evo=searchEvolution({taskId,seed:deriveSeed(cfg.seed,`${taskId}:evo-run`),budget:cfg.budget,instances:cfg.instances,programSteps});
    const ann=searchAnneal({taskId,seed:deriveSeed(cfg.seed,`${taskId}:ann-run`),budget:cfg.budget,instances:cfg.instances,programSteps});
    const traces=[...evo.successfulTraces,...ann.successfulTraces];
    const transitions=transitionsFromTraces(traces);
    const enoughTransitions=transitions.length>=4;
    const fallback=identityMode(TASKS[taskId].dim);
    const comp=enoughTransitions
      ? compressTransitions(transitions,{maxModes:cfg.maxModes,validationFraction:.25,seed:deriveSeed(cfg.seed,`${taskId}:compress`)})
      : {modes:[],globalMode:fallback,assignments:[],validation:{nmseModes:1e6,nmseGlobal:1e6,count:0}};
    const modeParams=modeParameterCount(comp.modes);
    const tiny=enoughTransitions?trainTinyBaseline(transitions,Math.max(1,modeParams),deriveSeed(cfg.seed,`${taskId}:tiny`),30):null;
    const evals=evalInstances(taskId,cfg.seed,cfg.evalScale);
    const execution=taskId==='mandelbrot'?evaluateMandelbrot(evals,comp.modes,comp.globalMode,tiny):evaluateDiscrete(taskId,evals,comp.modes,comp.globalMode,tiny);
    execution.searchOnlyComplete=false;
    execution.searchOnlyScore=null;
    execution.searchCandidateEvaluations=2*cfg.budget*evals.length;
    const disabled=taskId==='mandelbrot'?{
      routedScore:execution.compiledScore,disabledScore:execution.globalScore,routedExact:0,disabledExact:0
    }:{
      routedScore:execution.compiledScore,disabledScore:execution.globalScore,routedExact:execution.compiledExact,disabledExact:execution.globalExact
    };
    const cross=crossSolverEvidence(comp.modes,transitions);
    const interpretation=interpretationEvidence(comp.modes,deriveSeed(cfg.seed,taskId));
    tasks[taskId]={
      search:{evolution:{bestScore:evo.bestScore,evaluations:evo.evaluations},anneal:{bestScore:ann.bestScore,evaluations:ann.evaluations}},
      compression:{modeCount:comp.modes.length,nmseModes:comp.validation.nmseModes,nmseGlobal:comp.validation.nmseGlobal,validationCount:comp.validation.count,successfulTraceCount:traces.length,successfulTransitionCount:transitions.length,available:enoughTransitions},
      execution,ablation:disabled,crossSolver:cross,interpretation,
      modes:comp.modes.map(m=>({id:m.id,prototype:m.prototype,scale:m.scale,threshold:m.threshold,A:m.A,b:m.b,trainSolvers:m.trainSolvers,count:m.count})),
      parameterCount:{modes:modeParams,neural:tiny?.paramCount??0}
    };
    baselines[taskId]={globalScore:execution.globalScore,neuralScore:execution.neuralScore??null};
  }
  const report={
    engineering:{ok:true,version:1,receiptSchemaVersion:1},
    config:{...cfg,fullDefault:{budgetPerGeneratorPerTask:4000,mandelbrotGrid:'96x96',gcdHeldout:128,sort4Heldout:256,parityHeldout:256}},
    tasks,baselines,
    controls:{mandelbrotImitation:runMandelbrotImitationControl({side:cfg.evalScale==='full'?96:24})}
  };
  report.gates=evaluateGates(report);
  return report;
}
