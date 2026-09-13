import { sourceResidual, applyAffine } from './compress.js';
import { TASKS, initialState, applyEnvironment, scoreState, isTerminal } from './tasks.js';

export function routeMode(modes,state,disabledIds=[]){
  let best=null;
  for(const mode of modes){
    if(disabledIds.includes(mode.id)) continue;
    const residual=sourceResidual(mode,state);
    if(!best || residual<best.residual) best={mode,residual};
  }
  if(!best || best.residual>best.mode.threshold) return null;
  const beta=8/Math.max(0.25,best.mode.threshold);
  const gate=1/(1+Math.exp(-beta*(best.mode.threshold-best.residual)));
  return {...best,gate};
}

export function executeModes({taskId,instance,modes,globalMode=null,maxSteps=TASKS[taskId].maxSteps,disabledIds=[],routing='routed'}={}){
  let state=initialState(taskId,instance);
  const trace=[state.slice()], route=[];
  for(let step=0;step<maxSteps;step++){
    let modeInfo=null;
    if(routing==='global') modeInfo=globalMode?{mode:globalMode,residual:0,gate:1}:null;
    else if(routing==='random'){
      const active=modes.filter(m=>!disabledIds.includes(m.id));
      const m=active.length?active[step%active.length]:null;
      modeInfo=m?{mode:m,residual:sourceResidual(m,state),gate:1}:null;
    } else modeInfo=routeMode(modes,state,disabledIds);
    if(!modeInfo){ route.push({modeId:'UNKNOWN',residual:null}); break; }
    state=applyAffine(modeInfo.mode,state);
    state=applyEnvironment(taskId,instance,state,step);
    trace.push(state.slice());
    route.push({modeId:modeInfo.mode.id,residual:modeInfo.residual,gate:modeInfo.gate});
    if(isTerminal(taskId,instance,state,step)) break;
  }
  return {state,trace,route,score:scoreState(taskId,instance,state,trace),unknown:route.some(r=>r.modeId==='UNKNOWN'),steps:trace.length-1};
}
