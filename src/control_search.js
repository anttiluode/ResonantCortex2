import { makeRng,deriveSeed } from './prng.js';
import { makeControlInstance,runControlPolicy } from './control_tasks.js';
import { randomControlPolicy,mutateControlPolicy,cloneControlPolicy } from './control_policy.js';

function instances(taskId,seed,n){
  const rng=makeRng(deriveSeed(seed,`${taskId}:control-instances`));
  return Array.from({length:n},()=>makeControlInstance(taskId,rng,'search'));
}
function evaluate(policy,taskId,inst,substrate){
  let s=0; const runs=[];
  for(const x of inst){ const r=runControlPolicy({taskId,instance:x,policy,substrate}); s+=r.score; runs.push(r); }
  return {score:s/inst.length,runs};
}
function traces(policy,taskId,inst,substrate,solver){
  return inst.map(instance=>{
    const r=runControlPolicy({taskId,instance,policy,substrate});
    return {solver,taskId,score:r.score,exact:r.exact,instance:JSON.parse(JSON.stringify(instance)),states:r.trajectory.map(s=>s.slice()),inputs:r.inputs.map(x=>x.slice()),controls:r.controls.map(x=>x.slice()),stepMeta:r.stepMeta.map(x=>({...x}))};
  });
}

export function searchControlEvolution({taskId,seed=1,budget=400,instances:instanceCount=10,substrate,population=24}={}){
  const rng=makeRng(deriveSeed(seed,`${taskId}:control-evo`));
  const inst=instances(taskId,seed,instanceCount);
  let pop=[],evaluations=0;
  const init=Math.min(population,budget);
  for(let i=0;i<init;i++){
    const p=randomControlPolicy(substrate.n,3,rng,substrate.nsite,3);
    const ev=evaluate(p,taskId,inst,substrate); pop.push({policy:p,score:ev.score}); evaluations++;
  }
  while(evaluations<budget){
    pop.sort((a,b)=>b.score-a.score);
    const elites=pop.slice(0,Math.max(2,Math.floor(pop.length/5)));
    const next=elites.map(e=>({policy:cloneControlPolicy(e.policy),score:e.score}));
    while(next.length<population&&evaluations<budget){
      const parent=elites[Math.floor(rng()*elites.length)].policy;
      const frac=evaluations/Math.max(1,budget);
      const child=mutateControlPolicy(parent,rng,0.20*(1-frac)+0.025);
      next.push({policy:child,score:evaluate(child,taskId,inst,substrate).score}); evaluations++;
    }
    pop=next;
  }
  pop.sort((a,b)=>b.score-a.score); const best=pop[0];
  const bestTraces=traces(best.policy,taskId,inst,substrate,'evolution');
  return {bestPolicy:best.policy,bestScore:best.score,evaluations,bestTraces,successfulTraces:bestTraces.filter(t=>t.score>=0.80)};
}

export function searchControlAnneal({taskId,seed=1,budget=400,instances:instanceCount=10,substrate}={}){
  const rng=makeRng(deriveSeed(seed,`${taskId}:control-anneal`));
  const inst=instances(taskId,seed,instanceCount);
  let current=randomControlPolicy(substrate.n,3,rng,substrate.nsite,3);
  let cur=evaluate(current,taskId,inst,substrate).score;
  let best=cloneControlPolicy(current),bestScore=cur,evaluations=1;
  while(evaluations<budget){
    const frac=evaluations/Math.max(1,budget-1),temp=0.12*Math.pow(0.008/0.12,frac);
    const cand=mutateControlPolicy(current,rng,0.16*(1-frac)+0.02);
    const score=evaluate(cand,taskId,inst,substrate).score; evaluations++;
    if(score>=cur||rng()<Math.exp((score-cur)/Math.max(1e-9,temp))){ current=cand; cur=score; }
    if(score>bestScore){ best=cloneControlPolicy(cand); bestScore=score; }
  }
  const bestTraces=traces(best,taskId,inst,substrate,'anneal');
  return {bestPolicy:best,bestScore,evaluations,bestTraces,successfulTraces:bestTraces.filter(t=>t.score>=0.80)};
}
