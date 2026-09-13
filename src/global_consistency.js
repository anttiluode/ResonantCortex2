import { makeRng,deriveSeed } from './prng.js';
import { stepSubstrate } from './causal_substrate.js';
import { controlReadout } from './control_tasks.js';

const mean=xs=>xs.reduce((a,b)=>a+b,0)/Math.max(1,xs.length);
const norm=v=>Math.sqrt(v.reduce((s,x)=>s+x*x,0));

function closure(start,end,safety){
  let e=0; for(let i=0;i<start.length;i++) e+=(end[i]-start[i])**2;
  return Math.sqrt(e/start.length)/Math.max(1e-12,safety);
}

function runControls(substrate,startState,steps,name,label=null){
  let state=startState.slice();
  const trace=[state.slice()],motifSequence=[],stepMeta=[];
  let maxApplicabilityResidual=0,maxNewtonResidual=0,allConverged=true,boundsOk=true,finite=true;
  for(const item of steps){
    const c=item.control.map(v=>Math.max(-1,Math.min(1,v)));
    const ar=norm(c)/Math.sqrt(c.length);
    maxApplicabilityResidual=Math.max(maxApplicabilityResidual,ar);
    if(item.control.some(v=>v<-1||v>1)) boundsOk=false;
    const r=stepSubstrate(substrate,state,c);
    allConverged=allConverged&&r.converged;
    finite=finite&&r.state.every(Number.isFinite);
    maxNewtonResidual=Math.max(maxNewtonResidual,Number.isFinite(r.residual)?r.residual:Infinity);
    state=r.state; trace.push(state.slice()); motifSequence.push(item.name);
    stepMeta.push({name:item.name,control:r.control.slice(),converged:r.converged,residual:r.residual,applicabilityResidual:ar});
  }
  const readoutClosure=Math.abs(controlReadout(state)-controlReadout(startState))/2;
  const invariantClosure=closure(startState,state,substrate.constants.safety);
  const closureError=Math.max(readoutClosure,invariantClosure);
  return {name,label,startState:startState.slice(),endState:state.slice(),trace,motifSequence,stepMeta,readoutClosure,invariantClosure,closureError,maxApplicabilityResidual,maxNewtonResidual,allConverged,boundsOk,finite,localLegal:allConverged&&boundsOk&&finite&&maxApplicabilityResidual<=1};
}

function repeated(name,control,n){ return Array.from({length:n},()=>({name,control:control.slice()})); }
function seq(...parts){ return parts.flat(); }

export function makeLoopEpisodes({substrate,seed=1}={}){
  const rng=makeRng(deriveSeed(seed,'v3-loops'));
  const zero=Array(substrate.n).fill(0);
  const pulse=(amp,site)=>Array.from({length:substrate.nsite},(_,i)=>i===site?amp:0);
  const l2=(amp,label=null,suffix='')=>runControls(substrate,zero,seq(repeated(`P+${suffix}`,pulse(amp,1),4),repeated(`P-${suffix}`,pulse(-amp,1),4)),`L2${suffix}`,label);
  const l3=(amp,reverse=false,label=null,suffix='')=>{
    const A=repeated(`A${suffix}`,pulse(amp,0),3),B=repeated(`B${suffix}`,pulse(amp,2),3),Ai=repeated(`A-${suffix}`,pulse(-amp,0),3),Bi=repeated(`B-${suffix}`,pulse(-amp,2),3);
    return runControls(substrate,zero,reverse?seq(B,A,Bi,Ai):seq(A,B,Ai,Bi),`L3${reverse?'R':''}${suffix}`,label);
  };
  const init=runControls(substrate,zero,repeated('SET',pulse(.75,1),5),'init');
  const start=init.endState;
  const toggleSteps=[];
  let simulated=start.slice();
  for(let q=0;q<2;q++){
    const sign=controlReadout(simulated)>=0?-1:1;
    const cmd=pulse(.9*sign,1);
    for(let k=0;k<4;k++){
      toggleSteps.push({name:'TOGGLE',control:cmd.slice()});
      simulated=stepSubstrate(substrate,simulated,cmd).state;
    }
  }
  const probes=[runControls(substrate,start,toggleSteps,'L1-double-toggle'),l2(.90,null,'-probe'),l3(.90,false,null,'-probe'),l3(.90,true,null,'-probe')];

  const calibration=[],heldout=[];
  for(let i=0;i<12;i++){
    const goodAmp=.02+.10*rng(),badAmp=.68+.20*rng();
    calibration.push(l2(goodAmp,'good',`-cal-g${i}`));
    calibration.push(l3(badAmp,i%2===0,'bad',`-cal-b${i}`));
  }
  for(let i=0;i<20;i++){
    const goodAmp=.03+.12*rng(),badAmp=.70+.25*rng();
    heldout.push(l2(goodAmp,'good',`-test-g${i}`));
    heldout.push(l3(badAmp,i%2===1,'bad',`-test-b${i}`));
  }
  return {probes,calibration,heldout};
}

export function loopMetrics(episode){
  return {
    name:episode.name,label:episode.label,localLegal:episode.localLegal,allConverged:episode.allConverged,boundsOk:episode.boundsOk,finite:episode.finite,
    readoutClosure:episode.readoutClosure,invariantClosure:episode.invariantClosure,closureError:episode.closureError,
    motifSequence:episode.motifSequence.slice(),maxApplicabilityResidual:episode.maxApplicabilityResidual,maxNewtonResidual:episode.maxNewtonResidual
  };
}

function anomalyScore(e){ return Math.max(e.readoutClosure??0,e.invariantClosure??0); }

export function calibrateClosureMonitor(calibration){
  const good=calibration.filter(e=>e.label==='good').map(anomalyScore).sort((a,b)=>a-b);
  if(!good.length) throw new Error('calibration requires good loops');
  const candidates=[...new Set(good)].sort((a,b)=>a-b);
  let threshold=candidates[candidates.length-1];
  for(const t of candidates){
    const fpr=good.filter(x=>x>t).length/good.length;
    if(fpr<=.10){ threshold=t; break; }
  }
  return {threshold,feature:'max(readoutClosure,invariantClosure)',usesTaskLabels:false,calibrationGoodCount:good.length};
}

export function evaluateClosureMonitor(monitor,heldout){
  const good=heldout.filter(e=>e.label==='good'),bad=heldout.filter(e=>e.label==='bad');
  const flag=e=>anomalyScore(e)>monitor.threshold;
  const badRecall=bad.length?bad.filter(flag).length/bad.length:0;
  const falsePositiveRate=good.length?good.filter(flag).length/good.length:0;
  return {badRecall,falsePositiveRate,usesTaskLabels:false,threshold:monitor.threshold,goodCount:good.length,badCount:bad.length};
}
