import { makeRng, deriveSeed } from './prng.js';
import { TASKS, makeInstance } from './tasks.js';
import { randomProgram, mutateProgram, runProgram, cloneProgram } from './operators.js';

function makeSearchInstances(taskId, seed, n){
  const rng=makeRng(deriveSeed(seed,`${taskId}:instances`));
  return Array.from({length:n},()=>makeInstance(taskId,rng,'search'));
}

function evaluate(program, taskId, instances){
  let total=0;
  const runs=[];
  for(const inst of instances){ const r=runProgram(program,taskId,inst); total+=r.score; runs.push(r); }
  return {score:total/instances.length,runs};
}

function tracesFrom(program, taskId, instances, solver){
  return instances.map(inst=>{
    const r=runProgram(program,taskId,inst);
    return {solver,taskId,score:r.score,states:r.trace.map(s=>s.slice())};
  });
}

export function searchEvolution({taskId,seed=1,budget=4000,instances=12,programSteps=2,population=20}={}){
  const rng=makeRng(deriveSeed(seed,`${taskId}:evo`));
  const inst=makeSearchInstances(taskId,seed,instances);
  const dim=TASKS[taskId].dim;
  let pop=[];
  let evaluations=0;
  const initial=Math.min(population,budget);
  for(let i=0;i<initial;i++){
    const p=randomProgram(dim,rng,programSteps);
    const ev=evaluate(p,taskId,inst); evaluations++;
    pop.push({program:p,score:ev.score});
  }
  while(evaluations<budget){
    pop.sort((a,b)=>b.score-a.score);
    const elites=pop.slice(0,Math.max(2,Math.floor(pop.length/5)));
    const next=elites.map(x=>({program:cloneProgram(x.program),score:x.score}));
    while(next.length<population && evaluations<budget){
      const parent=elites[Math.floor(rng()*elites.length)].program;
      const sigma=0.18*(1-evaluations/Math.max(1,budget))+0.025;
      const child=mutateProgram(parent,rng,sigma);
      const ev=evaluate(child,taskId,inst); evaluations++;
      next.push({program:child,score:ev.score});
    }
    pop=next;
  }
  pop.sort((a,b)=>b.score-a.score);
  const best=pop[0];
  const bestTraces=tracesFrom(best.program,taskId,inst,'evolution');
  return {bestProgram:best.program,bestScore:best.score,evaluations,bestTraces,successfulTraces:bestTraces.filter(t=>t.score>=0.8)};
}

export function searchAnneal({taskId,seed=1,budget=4000,instances=12,programSteps=2}={}){
  const rng=makeRng(deriveSeed(seed,`${taskId}:anneal`));
  const inst=makeSearchInstances(taskId,seed,instances);
  let current=randomProgram(TASKS[taskId].dim,rng,programSteps);
  let cur=evaluate(current,taskId,inst).score;
  let best=cloneProgram(current), bestScore=cur;
  let evaluations=1;
  while(evaluations<budget){
    const frac=evaluations/Math.max(1,budget-1);
    const temp=0.25*Math.pow(0.01/0.25,frac);
    const cand=mutateProgram(current,rng,0.14*(1-frac)+0.02);
    const score=evaluate(cand,taskId,inst).score;
    evaluations++;
    if(score>=cur || rng()<Math.exp((score-cur)/Math.max(temp,1e-9))){ current=cand; cur=score; }
    if(score>bestScore){ best=cloneProgram(cand); bestScore=score; }
  }
  const bestTraces=tracesFrom(best,taskId,inst,'anneal');
  return {bestProgram:best,bestScore,evaluations,bestTraces,successfulTraces:bestTraces.filter(t=>t.score>=0.8)};
}
