import { applyAffine } from './compress.js';
import { r2 } from './metrics.js';

function flattenOutputs(fn, probes){ return probes.flatMap(s=>fn(s)); }

function identityFn(s){ return s.slice(); }
function signFlipFn(s){ return s.map(x=>-x); }

function nearestPermutation(mode){
  const d=mode.A.length;
  const picks=[];
  const used=new Set();
  for(let i=0;i<d;i++){
    let best=-1,bestVal=-Infinity,bestSign=1;
    for(let j=0;j<d;j++) if(!used.has(j)){
      const v=Math.abs(mode.A[i][j]);
      if(v>bestVal){bestVal=v;best=j;bestSign=mode.A[i][j]>=0?1:-1;}
    }
    picks.push([best,bestSign]); used.add(best);
  }
  return s=>picks.map(([j,sgn],i)=>sgn*s[j]+(Math.abs(mode.b[i])<0.05?0:mode.b[i]));
}

function diagonalScale(mode){
  const d=mode.A.length;
  const diag=Array.from({length:d},(_,i)=>mode.A[i][i]);
  return s=>s.map((x,i)=>diag[i]*x+(Math.abs(mode.b[i])<0.05?0:mode.b[i]));
}

function binaryToggle(mode){
  const d=mode.A.length;
  let idx=0,best=-Infinity;
  for(let i=0;i<d;i++){
    const closeness=-Math.abs(mode.A[i][i]+1)-Math.abs(mode.b[i]-1);
    if(closeness>best){best=closeness;idx=i;}
  }
  return s=>s.map((x,i)=>i===idx?1-x:x);
}

export function interpretMode(mode, probeStates){
  const truth=flattenOutputs(s=>applyAffine(mode,s),probeStates);
  const candidates=[
    {name:'IDENTITY',fn:identityFn},
    {name:'SIGN_FLIP',fn:signFlipFn},
    {name:'PERMUTE_OR_SWAP',fn:nearestPermutation(mode)},
    {name:'DIAGONAL_SCALE',fn:diagonalScale(mode)},
    {name:'BINARY_TOGGLE',fn:binaryToggle(mode)}
  ];
  let best={name:'UNNAMED',r2:-Infinity};
  for(const c of candidates){
    const pred=flattenOutputs(c.fn,probeStates);
    const score=r2(pred,truth);
    if(score>best.r2) best={name:c.name,r2:score};
  }
  return {name:best.r2>=0.98?best.name:'UNNAMED',bestR2:best.r2,probeCount:probeStates.length,candidates:candidates.map(c=>({name:c.name,r2:r2(flattenOutputs(c.fn,probeStates),truth)})).sort((a,b)=>b.r2-a.r2)};
}

export function modeStructuralSummary(mode){
  const d=mode.A.length;
  const changed=[];
  for(let i=0;i<d;i++){
    let delta=Math.abs(mode.b[i]);
    for(let j=0;j<d;j++) delta+=Math.abs(mode.A[i][j]-(i===j?1:0));
    changed.push({index:i,delta});
  }
  changed.sort((a,b)=>b.delta-a.delta);
  const diag=Array.from({length:d},(_,i)=>Math.abs(mode.A[i][i]));
  const rankProxy=diag.filter(x=>x>1e-3).length;
  return {effectiveRank:rankProxy,mostChanged:changed.slice(0,3),mostPreserved:changed.slice(-3).reverse()};
}

export function ablateModeBank(){ return null; }
