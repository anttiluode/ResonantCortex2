import { makeRng, shuffle } from './prng.js';

const EPS=1e-12;
const sq=x=>x*x;
const mean=xs=>xs.reduce((a,b)=>a+b,0)/Math.max(1,xs.length);

function solveLinear(M, y){
  const n=M.length;
  const A=M.map((row,i)=>row.slice().concat([y[i]]));
  for(let col=0; col<n; col++){
    let pivot=col;
    for(let r=col+1;r<n;r++) if(Math.abs(A[r][col])>Math.abs(A[pivot][col])) pivot=r;
    if(Math.abs(A[pivot][col])<1e-10) A[pivot][col]+=1e-8;
    [A[col],A[pivot]]=[A[pivot],A[col]];
    const d=A[col][col] || 1e-8;
    for(let j=col;j<=n;j++) A[col][j]/=d;
    for(let r=0;r<n;r++) if(r!==col){
      const f=A[r][col];
      if(f===0) continue;
      for(let j=col;j<=n;j++) A[r][j]-=f*A[col][j];
    }
  }
  return A.map(r=>r[n]);
}

function fitAffine(transitions, ridge=1e-6){
  if(!transitions.length) throw new Error('cannot fit empty transitions');
  const d=transitions[0].state.length;
  const p=d+1;
  const XtX=Array.from({length:p},()=>Array(p).fill(0));
  const XtY=Array.from({length:p},()=>Array(d).fill(0));
  for(const tr of transitions){
    const x=tr.state.concat([1]);
    for(let i=0;i<p;i++){
      for(let j=0;j<p;j++) XtX[i][j]+=x[i]*x[j];
      for(let o=0;o<d;o++) XtY[i][o]+=x[i]*tr.next[o];
    }
  }
  for(let i=0;i<p;i++) XtX[i][i]+=ridge;
  const A=Array.from({length:d},()=>Array(d).fill(0));
  const b=Array(d).fill(0);
  for(let o=0;o<d;o++){
    const beta=solveLinear(XtX,XtY.map(r=>r[o]));
    for(let j=0;j<d;j++) A[o][j]=beta[j];
    b[o]=beta[d];
  }
  return {A,b};
}

export function applyAffine(mode,state){
  return mode.A.map((row,i)=>row.reduce((s,w,j)=>s+w*state[j],mode.b[i]));
}

function transitionMse(mode, tr){
  const p=applyAffine(mode,tr.state);
  return mean(p.map((v,i)=>sq(v-tr.next[i])));
}

function varianceDen(transitions){
  if(!transitions.length) return 1;
  const d=transitions[0].next.length;
  const mu=Array(d).fill(0);
  for(const tr of transitions) for(let i=0;i<d;i++) mu[i]+=tr.next[i];
  for(let i=0;i<d;i++) mu[i]/=transitions.length;
  let v=0;
  for(const tr of transitions) for(let i=0;i<d;i++) v+=sq(tr.next[i]-mu[i]);
  return v/(transitions.length*d)+EPS;
}

function sourceStats(transitions){
  const d=transitions[0].state.length;
  const prototype=Array(d).fill(0);
  for(const tr of transitions) for(let i=0;i<d;i++) prototype[i]+=tr.state[i];
  for(let i=0;i<d;i++) prototype[i]/=transitions.length;
  const scale=Array(d).fill(0);
  for(const tr of transitions) for(let i=0;i<d;i++) scale[i]+=sq(tr.state[i]-prototype[i]);
  for(let i=0;i<d;i++) scale[i]=Math.max(0.05,Math.sqrt(scale[i]/transitions.length));
  const dist=transitions.map(tr=>sourceResidual({prototype,scale},tr.state)).sort((a,b)=>a-b);
  const threshold=Math.max(0.5,dist[Math.min(dist.length-1,Math.floor(0.95*(dist.length-1)))]+0.15);
  return {prototype,scale,threshold};
}

export function sourceResidual(mode,state){
  let s=0;
  for(let i=0;i<state.length;i++) s+=sq((state[i]-mode.prototype[i])/(mode.scale[i]||0.05));
  return Math.sqrt(s/state.length);
}

function makeMode(transitions,id){
  const {A,b}=fitAffine(transitions);
  const stats=sourceStats(transitions);
  return {id,A,b,...stats,trainSolvers:[...new Set(transitions.map(t=>t.solver).filter(Boolean))].sort(),count:transitions.length};
}

export function fitGlobalOperator(transitions){ return makeMode(transitions,'global'); }

function modeForState(modes,state){
  let best=null,bestR=Infinity;
  for(const mode of modes){ const r=sourceResidual(mode,state); if(r<bestR){bestR=r;best=mode;} }
  return best;
}

function routedNmse(modes, transitions, den=varianceDen(transitions)){
  if(!transitions.length) return 0;
  let err=0;
  for(const tr of transitions){ const mode=modeForState(modes,tr.state); err+=transitionMse(mode,tr); }
  return err/transitions.length/den;
}

function splitCandidate(cluster){
  if(cluster.length<8) return null;
  const d=cluster[0].state.length;
  let bestDim=0,bestVar=-1;
  for(let j=0;j<d;j++){
    const mu=mean(cluster.map(t=>t.state[j]));
    const v=mean(cluster.map(t=>sq(t.state[j]-mu)));
    if(v>bestVar){bestVar=v;bestDim=j;}
  }
  const sorted=cluster.map(t=>t.state[bestDim]).sort((a,b)=>a-b);
  const cut=sorted[Math.floor(sorted.length/2)];
  const left=cluster.filter(t=>t.state[bestDim]<=cut);
  const right=cluster.filter(t=>t.state[bestDim]>cut);
  if(left.length<3||right.length<3) return null;
  return [left,right];
}

export function compressTransitions(transitions,{maxModes=12,validationFraction=0.25,seed=1}={}){
  if(transitions.length<4) throw new Error('need at least four transitions');
  const rng=makeRng(seed);
  const shuffled=shuffle(rng,transitions);
  const nVal=Math.max(1,Math.floor(shuffled.length*validationFraction));
  const val=shuffled.slice(0,nVal), train=shuffled.slice(nVal);
  const globalMode=fitGlobalOperator(train);
  const den=varianceDen(val);
  const nmseGlobal=mean(val.map(t=>transitionMse(globalMode,t)))/den;
  let clusters=[train];
  let modes=[makeMode(train,0)];
  let bestNmse=routedNmse(modes,val,den);
  while(clusters.length<maxModes){
    let accepted=null;
    for(let ci=0;ci<clusters.length;ci++){
      const split=splitCandidate(clusters[ci]);
      if(!split) continue;
      const candidateClusters=clusters.slice(0,ci).concat(split,clusters.slice(ci+1));
      const candidateModes=candidateClusters.map((c,i)=>makeMode(c,i));
      const score=routedNmse(candidateModes,val,den);
      if(score < bestNmse*0.98 && (!accepted || score<accepted.score)) accepted={clusters:candidateClusters,modes:candidateModes,score};
    }
    if(!accepted) break;
    clusters=accepted.clusters; modes=accepted.modes; bestNmse=accepted.score;
  }
  if(modes.length===1 && maxModes>1){
    const split=splitCandidate(train);
    if(split){
      const candidate=split.map((c,i)=>makeMode(c,i));
      const trainDen=varianceDen(train);
      if(routedNmse(candidate,train,trainDen)<routedNmse(modes,train,trainDen)*0.8){ modes=candidate; clusters=split; bestNmse=routedNmse(modes,val,den); }
    }
  }
  const assignments=train.map(tr=>modeForState(modes,tr.state).id);
  return {modes,globalMode,assignments,validation:{nmseModes:bestNmse,nmseGlobal,count:val.length}};
}

export function transitionsFromTraces(traces){
  const out=[];
  for(const t of traces){
    for(let i=0;i+1<t.states.length;i++) out.push({state:t.states[i].slice(),next:t.states[i+1].slice(),solver:t.solver,taskId:t.taskId,traceScore:t.score});
  }
  return out;
}
