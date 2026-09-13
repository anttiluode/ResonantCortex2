import { randn } from './prng.js';

const sigmoid=x=>x>=0?1/(1+Math.exp(-Math.min(60,x))):Math.exp(Math.max(-60,x))/(1+Math.exp(Math.max(-60,x)));
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);

export function randomControlPolicy(dim,inputDim,rng,nsite=3,units=3){
  const bank=[];
  for(let u=0;u<units;u++) bank.push({
    W:Array.from({length:nsite},()=>Array.from({length:dim},()=>randn(rng)*0.10)),
    V:Array.from({length:nsite},()=>Array.from({length:inputDim},()=>randn(rng)*0.30)),
    b:Array.from({length:nsite},()=>randn(rng)*0.08),
    q:Array.from({length:dim},()=>randn(rng)*0.16),
    r:Array.from({length:inputDim},()=>randn(rng)*0.20),
    c:randn(rng)*0.10,
    k:1+2*rng()
  });
  return {dim,inputDim,nsite,units:bank};
}

export function cloneControlPolicy(p){
  return {dim:p.dim,inputDim:p.inputDim,nsite:p.nsite,units:p.units.map(u=>({
    W:u.W.map(r=>r.slice()),V:u.V.map(r=>r.slice()),b:u.b.slice(),q:u.q.slice(),r:u.r.slice(),c:u.c,k:u.k
  }))};
}

export function applyControlPolicy(policy,state,input){
  const acc=Array(policy.nsite).fill(0);
  for(const u of policy.units){
    const g=sigmoid(u.k*(dot(u.q,state)+dot(u.r,input)+u.c));
    for(let o=0;o<policy.nsite;o++){
      let v=u.b[o]+dot(u.W[o],state)+dot(u.V[o],input);
      acc[o]+=g*Math.tanh(v);
    }
  }
  return acc.map(Math.tanh);
}

export function mutateControlPolicy(policy,rng,sigma=0.12){
  const p=cloneControlPolicy(policy);
  const edits=2+Math.floor(rng()*5);
  for(let e=0;e<edits;e++){
    const u=p.units[Math.floor(rng()*p.units.length)];
    const kind=Math.floor(rng()*7);
    if(kind===0){ const i=Math.floor(rng()*p.nsite),j=Math.floor(rng()*p.dim); u.W[i][j]+=randn(rng)*sigma; }
    else if(kind===1){ const i=Math.floor(rng()*p.nsite),j=Math.floor(rng()*p.inputDim); u.V[i][j]+=randn(rng)*sigma; }
    else if(kind===2) u.b[Math.floor(rng()*p.nsite)]+=randn(rng)*sigma;
    else if(kind===3) u.q[Math.floor(rng()*p.dim)]+=randn(rng)*sigma;
    else if(kind===4) u.r[Math.floor(rng()*p.inputDim)]+=randn(rng)*sigma;
    else if(kind===5) u.c+=randn(rng)*sigma;
    else u.k=Math.max(0.25,Math.min(12,u.k+randn(rng)*sigma*2));
  }
  return p;
}

export function controlPolicyParameterCount(p){
  return p.units.reduce((n,u)=>n+u.W.length*u.W[0].length+u.V.length*u.V[0].length+u.b.length+u.q.length+u.r.length+2,0);
}
