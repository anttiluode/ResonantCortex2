import { applyAffine, sourceResidual } from './compress.js';
import { applyEnvironment, isTerminal } from './tasks.js';

const EPS=1e-12;

function normalizedResidual(mode,state){
  return sourceResidual(mode,state)/Math.max(EPS,mode.threshold);
}

function nearestMode(modes,state){
  let best=null;
  for(const mode of modes){
    const cost=normalizedResidual(mode,state);
    if(!best||cost<best.cost) best={mode,cost};
  }
  return best;
}

export function buildSuccessorGraph(modes,traces,{alpha=0.5}={}){
  const ids=modes.map(m=>String(m.id));
  const counts={}, probs={}, support={};
  for(const i of ids){
    counts[i]={}; probs[i]={}; support[i]=0;
    for(const j of ids) counts[i][j]=0;
  }
  for(const trace of traces){
    if(!trace?.states?.length) continue;
    const seq=[];
    for(const state of trace.states){
      const n=nearestMode(modes,state);
      if(n){ seq.push(String(n.mode.id)); support[String(n.mode.id)]=(support[String(n.mode.id)]||0)+1; }
    }
    for(let t=0;t+1<seq.length;t++) counts[seq[t]][seq[t+1]]++;
  }
  const edges=[];
  for(const i of ids){
    const total=ids.reduce((s,j)=>s+counts[i][j],0);
    const den=total+alpha*Math.max(1,ids.length);
    for(const j of ids){
      const p=ids.length?(counts[i][j]+alpha)/Math.max(EPS,den):0;
      probs[i][j]=p;
      if(counts[i][j]>0) edges.push({from:modes.find(m=>String(m.id)===i)?.id??i,to:modes.find(m=>String(m.id)===j)?.id??j,count:counts[i][j],prob:p});
    }
  }
  edges.sort((a,b)=>b.count-a.count || b.prob-a.prob || String(a.from).localeCompare(String(b.from)) || String(a.to).localeCompare(String(b.to)));
  return {alpha,counts,probs,support,edges};
}

function probability(graph,from,to,nModes){
  const p=graph?.probs?.[String(from)]?.[String(to)];
  return Number.isFinite(p)?p:1/Math.max(1,nModes);
}

export function routeModeSuccessor({
  modes,
  state,
  taskId,
  instance,
  step,
  successorGraph,
  disabledIds=[],
  lambda=0.75,
  eta=0.10,
  sourceTolerance=1.25,
  destinationTolerance=1.50,
  applyEnvironmentFn=applyEnvironment,
  isTerminalFn=isTerminal
}={}){
  const active=modes.filter(m=>!disabledIds.includes(m.id));
  let best=null;
  for(const mode of active){
    const residual=sourceResidual(mode,state);
    const sourceCost=residual/Math.max(EPS,mode.threshold);
    if(sourceCost>sourceTolerance) continue;
    const predicted=applyEnvironmentFn(taskId,instance,applyAffine(mode,state),step);
    const terminal=isTerminalFn(taskId,instance,predicted,step);
    let expectedSuccessorId=null,destCost=0,prior=1,priorCost=0;
    if(!terminal){
      let bestDest=null;
      for(const next of active){
        const d=normalizedResidual(next,predicted);
        if(d>destinationTolerance) continue;
        const p=probability(successorGraph,mode.id,next.id,active.length);
        const pc=-Math.log(Math.max(EPS,p));
        const continuation=lambda*d+eta*pc;
        if(!bestDest||continuation<bestDest.continuation){
          bestDest={mode:next,d,p,pc,continuation};
        }
      }
      if(!bestDest) continue;
      expectedSuccessorId=bestDest.mode.id;
      destCost=bestDest.d;
      prior=bestDest.p;
      priorCost=bestDest.pc;
    }
    const continuationCost=sourceCost+lambda*destCost+eta*priorCost;
    if(!best||continuationCost<best.continuationCost){
      const beta=8/Math.max(0.25,mode.threshold);
      const gate=1/(1+Math.exp(-beta*(mode.threshold-residual)));
      best={mode,residual,gate,predicted,expectedSuccessorId,sourceCost,destCost,prior,continuationCost};
    }
  }
  return best;
}
