import { TASKS, applyEnvironment } from './tasks.js';
import { applyAffine, sourceResidual } from './compress.js';
import { routeMode } from './executor.js';

export const ENDOGENOUS_DIMS={
  mandelbrot:[0,1,5,6],
  gcd:[2,3,4,6],
  sort4:[4,5,6,7],
  parity:[1,5,6]
};

const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;

export function stateError(taskId,pred,truth,dims=null){
  const idx=(dims||Array.from({length:Math.min(pred.length,truth.length)},(_,i)=>i)).filter(i=>i<pred.length&&i<truth.length);
  if(!idx.length) return 0;
  let s=0;
  for(const i of idx){ const d=pred[i]-truth[i]; s+=d*d; }
  return Math.sqrt(s/idx.length)/Math.max(1e-12,TASKS[taskId].safety);
}

function minManifoldRatio(modes,state){
  if(!modes.length) return 1e6;
  let best=Infinity;
  for(const m of modes){
    const r=sourceResidual(m,state)/Math.max(1e-12,m.threshold);
    if(r<best) best=r;
  }
  return Number.isFinite(best)?best:1e6;
}

function byId(modes,id){ return modes.find(m=>String(m.id)===String(id))||null; }

function applyMode(taskId,instance,mode,state,step,applyEnvironmentFn){
  const raw=applyAffine(mode,state);
  return applyEnvironmentFn(taskId,instance,raw,step);
}

function stepRecord(taskId,modes,pred,truth,modeId,unknown=false){
  return {
    modeId:unknown?'UNKNOWN':modeId,
    allError:stateError(taskId,pred,truth),
    endogenousError:stateError(taskId,pred,truth,ENDOGENOUS_DIMS[taskId]),
    manifoldRatio:minManifoldRatio(modes,pred),
    unknown:Boolean(unknown)
  };
}

export function assignTeacherRoute(modes,states){
  const out=[];
  for(let t=0;t+1<states.length;t++){
    const r=routeMode(modes,states[t]);
    out.push(r?{modeId:r.mode.id,residual:r.residual}:null);
  }
  return out;
}

function teacherOneStep(taskId,trace,modes,applyEnvironmentFn){
  const steps=[];
  for(let t=0;t+1<trace.states.length;t++){
    const info=routeMode(modes,trace.states[t]);
    if(!info){
      steps.push({...stepRecord(taskId,modes,trace.states[t],trace.states[t+1],'UNKNOWN',true),step:t+1,prediction:trace.states[t].slice()});
      continue;
    }
    const pred=applyMode(taskId,trace.instance,info.mode,trace.states[t],t,applyEnvironmentFn);
    steps.push({...stepRecord(taskId,modes,pred,trace.states[t+1],info.mode.id,false),step:t+1,prediction:pred});
  }
  return {steps};
}

function replaySequence(taskId,trace,modes,sequence,applyEnvironmentFn){
  let state=trace.states[0].slice();
  const steps=[];
  for(let t=0;t+1<trace.states.length;t++){
    const id=sequence[t];
    const mode=id==null?null:byId(modes,id);
    if(!mode){
      steps.push({...stepRecord(taskId,modes,state,trace.states[t+1],'UNKNOWN',true),step:t+1,prediction:state.slice()});
      break;
    }
    state=applyMode(taskId,trace.instance,mode,state,t,applyEnvironmentFn);
    steps.push({...stepRecord(taskId,modes,state,trace.states[t+1],mode.id,false),step:t+1,prediction:state.slice()});
  }
  return {steps};
}

function freeReplay(taskId,trace,modes,applyEnvironmentFn){
  let state=trace.states[0].slice();
  const steps=[];
  for(let t=0;t+1<trace.states.length;t++){
    const info=routeMode(modes,state);
    if(!info){
      steps.push({...stepRecord(taskId,modes,state,trace.states[t+1],'UNKNOWN',true),step:t+1,prediction:state.slice()});
      break;
    }
    state=applyMode(taskId,trace.instance,info.mode,state,t,applyEnvironmentFn);
    steps.push({...stepRecord(taskId,modes,state,trace.states[t+1],info.mode.id,false),step:t+1,prediction:state.slice()});
  }
  return {steps};
}

function oracleOneStep(taskId,trace,modes,applyEnvironmentFn){
  const steps=[];
  const dims=ENDOGENOUS_DIMS[taskId];
  for(let t=0;t+1<trace.states.length;t++){
    let best=null;
    for(const mode of modes){
      const pred=applyMode(taskId,trace.instance,mode,trace.states[t],t,applyEnvironmentFn);
      const e=stateError(taskId,pred,trace.states[t+1],dims);
      if(!best||e<best.e) best={mode,pred,e};
    }
    if(!best){
      steps.push({...stepRecord(taskId,modes,trace.states[t],trace.states[t+1],'UNKNOWN',true),step:t+1,prediction:trace.states[t].slice()});
      continue;
    }
    steps.push({...stepRecord(taskId,modes,best.pred,trace.states[t+1],best.mode.id,false),step:t+1,prediction:best.pred});
  }
  return {steps};
}

export function autopsyTrace({taskId,trace,modes,globalMode=null,applyEnvironmentFn=applyEnvironment}={}){
  const teacher=teacherOneStep(taskId,trace,modes,applyEnvironmentFn);
  const teacherIds=teacher.steps.map(s=>s.unknown?null:s.modeId);
  const fixed=replaySequence(taskId,trace,modes,teacherIds,applyEnvironmentFn);
  const free=freeReplay(taskId,trace,modes,applyEnvironmentFn);
  const oracle=oracleOneStep(taskId,trace,modes,applyEnvironmentFn);
  const oracleIds=oracle.steps.map(s=>s.unknown?null:s.modeId);
  const oracleRep=replaySequence(taskId,trace,modes,oracleIds,applyEnvironmentFn);
  return {teacherOneStep:teacher,fixedReplay:fixed,freeReplay:free,oracleOneStep:oracle,oracleReplay:oracleRep};
}

function atHorizon(report,key,h){ return report[key].steps.find(s=>s.step===h)||null; }

export function summarizeAutopsy(taskId,reports){
  const allTeacher=[] , allOracle=[];
  let eligibleTransitions=0;
  for(const r of reports){
    for(const s of r.teacherOneStep.steps){ if(!s.unknown){ allTeacher.push(s.endogenousError); eligibleTransitions++; } }
    for(const s of r.oracleOneStep.steps){ if(!s.unknown) allOracle.push(s.endogenousError); }
  }
  const teacherOneStepEndogenous=mean(allTeacher);
  const oracleOneStepEndogenous=mean(allOracle);
  const horizons={};
  for(const h of [1,2,4,8,16,32]){
    const fixed=[],free=[],oracle=[],manifold=[],unknown=[];
    for(const r of reports){
      const f=atHorizon(r,'fixedReplay',h), fr=atHorizon(r,'freeReplay',h), o=atHorizon(r,'oracleReplay',h);
      if(f) fixed.push(f.endogenousError);
      if(fr){ free.push(fr.endogenousError); manifold.push(fr.manifoldRatio<=1?1:0); unknown.push(fr.unknown?1:0); }
      if(o) oracle.push(o.endogenousError);
    }
    if(fixed.length||free.length||oracle.length){
      horizons[h]={
        fixedEndogenous:mean(fixed),
        freeEndogenous:mean(free),
        oracleEndogenous:mean(oracle),
        manifoldSurvival:mean(manifold),
        unknownRate:mean(unknown),
        count:Math.max(fixed.length,free.length,oracle.length)
      };
    }
  }
  let dominantFailure='insufficient_data';
  if(eligibleTransitions>=8){
    if(oracleOneStepEndogenous>0.10) dominantFailure='operator_vocabulary';
    else {
      const h4=horizons[4];
      const base=Math.max(teacherOneStepEndogenous,1e-6);
      if(h4 && h4.fixedEndogenous<=2*base && h4.freeEndogenous>2*base) dominantFailure='routing';
      else if(h4 && h4.fixedEndogenous>2*base) dominantFailure='accumulation';
      else dominantFailure='mixed';
    }
  }
  return {eligibleTransitions,teacherOneStepEndogenous,oracleOneStepEndogenous,horizons,dominantFailure};
}
