import { makeRng, randn } from './prng.js';

const EPS=1e-12;
const mean=xs=>xs.reduce((a,b)=>a+b,0)/Math.max(1,xs.length);

export function pearson(a,b){
  if(a.length!==b.length||a.length<2) return 0;
  const ma=mean(a), mb=mean(b);
  let num=0,da=0,db=0;
  for(let i=0;i<a.length;i++){
    const xa=a[i]-ma, xb=b[i]-mb;
    num+=xa*xb; da+=xa*xa; db+=xb*xb;
  }
  return num/Math.sqrt((da+EPS)*(db+EPS));
}

export function nmse(pred,truth){
  if(!pred.length) return 0;
  let mse=0;
  for(let i=0;i<pred.length;i++) mse+=(pred[i]-truth[i])**2;
  mse/=pred.length;
  const mt=mean(truth);
  let v=0; for(const x of truth) v+=(x-mt)**2; v/=truth.length;
  return mse/(v+EPS);
}

export function normalizedMae(pred,truth,maxValue=1){
  if(!pred.length) return 0;
  let e=0; for(let i=0;i<pred.length;i++) e+=Math.abs(pred[i]-truth[i]);
  return e/pred.length/Math.max(EPS,maxValue);
}

export function r2(pred,truth){
  if(!pred.length||pred.length!==truth.length) return -Infinity;
  const mt=mean(truth);
  let ssr=0,sst=0;
  for(let i=0;i<pred.length;i++){ ssr+=(truth[i]-pred[i])**2; sst+=(truth[i]-mt)**2; }
  if(sst<EPS) return ssr<EPS?1:0;
  return 1-ssr/(sst+EPS);
}

function gate0(report){
  const passTasks=Object.entries(report.tasks).filter(([,t])=>t.compression.nmseModes<=0.75*t.compression.nmseGlobal && t.compression.modeCount<=12).map(([id])=>id);
  return {pass:passTasks.length>=3,evidence:{passTasks,count:passTasks.length}};
}

function gate1(report){
  const passTasks=[];
  for(const [id,t] of Object.entries(report.tasks)){
    if(id==='mandelbrot'){
      if(t.execution.mandelbrotCorr>=0.90 && t.execution.mandelbrotNmae<=0.12) passTasks.push(id);
    } else {
      if(t.execution.compiledExact>=0.80 && t.execution.compiledExact-t.execution.globalExact>=0.20) passTasks.push(id);
    }
  }
  return {pass:passTasks.length>=2,evidence:{passTasks,count:passTasks.length}};
}

function gate2(report,g1){
  const details={}; let pass=true;
  for(const id of g1.evidence.passTasks){
    const e=report.tasks[id].execution;
    if(!e.searchOnlyComplete){ details[id]={pass:false,reason:'search-only held-out baseline not fully measured'}; pass=false; continue; }
    const ratio=e.searchCandidateEvaluations/Math.max(1,e.compiledOperations);
    const retained=e.compiledScore/Math.max(EPS,e.searchOnlyScore);
    const ok=ratio>=20 && retained>=0.90;
    details[id]={ratio,retained,pass:ok};
    if(!ok) pass=false;
  }
  if(g1.evidence.passTasks.length===0) pass=false;
  return {pass,evidence:details};
}

function gate3(report,g1){
  const passing=[];
  for(const id of g1.evidence.passTasks){
    const a=report.tasks[id].ablation;
    const exactDrop=(a.routedExact??0)-(a.disabledExact??0);
    const scoreDrop=(a.routedScore-a.disabledScore)/Math.max(EPS,Math.abs(a.routedScore));
    if(exactDrop>=0.20 || scoreDrop>=0.25) passing.push({id,exactDrop,scoreDrop});
  }
  return {pass:passing.length>=1,evidence:{passing}};
}

function gate4(report){
  const passing=[];
  for(const [id,t] of Object.entries(report.tasks)){
    if(t.crossSolver?.shared && t.crossSolver.fidelityRatio>=0.80) passing.push({id,...t.crossSolver});
  }
  return {pass:passing.length>=1,evidence:{passing}};
}

function gate5(report){
  const passing=[];
  for(const [id,t] of Object.entries(report.tasks)){
    if((t.interpretation?.probeCount??0)>=1000 && (t.interpretation?.bestR2??-Infinity)>=0.98) passing.push({id,...t.interpretation});
  }
  return {pass:passing.length>=1,evidence:{passing}};
}

function gate6(report){
  const passing=[];
  for(const [id,t] of Object.entries(report.tasks||{})){
    const a=t.autopsy;
    const h4=a?.horizons?.[4] ?? a?.horizons?.['4'];
    if(!a || (a.eligibleTransitions??0)<8 || !h4) continue;
    const teacher=a.teacherOneStepEndogenous;
    if(!Number.isFinite(teacher) || teacher>0.10) continue;
    const base=Math.max(teacher,1e-12);
    const gap=Math.max(h4.fixedEndogenous??0,h4.freeEndogenous??0);
    if(gap>=2*base) passing.push({id,teacherOneStepEndogenous:teacher,horizon4:h4,dominantFailure:a.dominantFailure});
  }
  return {pass:passing.length>=1,evidence:{passing}};
}

function gate7(report){
  const passing=[];
  for(const [id,t] of Object.entries(report.tasks||{})){
    const e=t.successorExecution;
    if(!e) continue;
    const gain=(e.score??-Infinity)-(e.sourceOnlyScore??0);
    const baselineGuard=(e.sourceOnlyScore??0)>(e.globalScore??0) ? (e.score??-Infinity)>=(e.globalScore??0)-0.02 : true;
    const u0=e.sourceOnlyUnknownRate;
    const u1=e.unknownRate;
    const unknownImprove=Number.isFinite(u0)&&u0>0&&Number.isFinite(u1) ? (u0-u1)/u0 : 0;
    const h0=e.sourceOnlyHorizon8Endogenous;
    const h1=e.horizon8Endogenous;
    const horizonImprove=Number.isFinite(h0)&&h0>0&&Number.isFinite(h1) ? (h0-h1)/h0 : 0;
    const continuationImprove=Math.max(unknownImprove,horizonImprove);
    if(gain>=0.10 && baselineGuard && continuationImprove>=0.20){
      passing.push({id,gain,baselineGuard,unknownImprove,horizonImprove,continuationImprove});
    }
  }
  return {pass:passing.length>=1,evidence:{passing}};
}

export function evaluateGates(report){
  const g0=gate0(report), g1=gate1(report);
  return {
    gate0:g0,
    gate1:g1,
    gate2:gate2(report,g1),
    gate3:gate3(report,g1),
    gate4:gate4(report),
    gate5:gate5(report),
    gate6:gate6(report),
    gate7:gate7(report)
  };
}

export function evaluateTaskBundle(bundle){ return bundle; }

export function modeParameterCount(modes){
  return modes.reduce((n,m)=>n+m.A.length*m.A[0].length+m.b.length+m.prototype.length+m.scale.length+1,0);
}

export function trainTinyBaseline(transitions, modeParams, seed=1, epochs=60){
  if(!transitions.length) return null;
  const d=transitions[0].state.length;
  let h=1;
  const paramsFor=x=>d*x+x+x*d+d;
  while(paramsFor(h)<0.5*modeParams && h<128) h++;
  while(h>1 && paramsFor(h)>2*modeParams) h--;
  const rng=makeRng(seed);
  const W1=Array.from({length:h},()=>Array.from({length:d},()=>randn(rng)*0.08));
  const b1=Array(h).fill(0);
  const W2=Array.from({length:d},()=>Array.from({length:h},()=>randn(rng)*0.08));
  const b2=Array(d).fill(0);
  const lr=0.03;
  const sample=transitions.length>256?transitions.slice(0,256):transitions;
  for(let ep=0;ep<epochs;ep++){
    const gW1=Array.from({length:h},()=>Array(d).fill(0)), gb1=Array(h).fill(0);
    const gW2=Array.from({length:d},()=>Array(h).fill(0)), gb2=Array(d).fill(0);
    for(const tr of sample){
      const hidden=W1.map((row,i)=>Math.tanh(row.reduce((s,w,j)=>s+w*tr.state[j],b1[i])));
      const out=W2.map((row,i)=>row.reduce((s,w,j)=>s+w*hidden[j],b2[i]));
      const go=out.map((v,i)=>2*(v-tr.next[i])/sample.length/d);
      for(let o=0;o<d;o++){ gb2[o]+=go[o]; for(let j=0;j<h;j++) gW2[o][j]+=go[o]*hidden[j]; }
      for(let j=0;j<h;j++){
        let gh=0; for(let o=0;o<d;o++) gh+=go[o]*W2[o][j];
        gh*=1-hidden[j]*hidden[j]; gb1[j]+=gh;
        for(let k=0;k<d;k++) gW1[j][k]+=gh*tr.state[k];
      }
    }
    for(let j=0;j<h;j++){ b1[j]-=lr*gb1[j]; for(let k=0;k<d;k++) W1[j][k]-=lr*gW1[j][k]; }
    for(let o=0;o<d;o++){ b2[o]-=lr*gb2[o]; for(let j=0;j<h;j++) W2[o][j]-=lr*gW2[o][j]; }
  }
  return {d,h,W1,b1,W2,b2,paramCount:paramsFor(h)};
}

export function predictTinyBaseline(model,state){
  if(!model) return state.slice();
  const hidden=model.W1.map((row,i)=>Math.tanh(row.reduce((s,w,j)=>s+w*state[j],model.b1[i])));
  return model.W2.map((row,i)=>row.reduce((s,w,j)=>s+w*hidden[j],model.b2[i]));
}
