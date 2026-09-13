import { randint } from './prng.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const nearly = (a, b, eps=1e-3) => Math.abs(a-b) <= eps;

function gcdInt(a,b){
  a=Math.abs(a|0); b=Math.abs(b|0);
  while(b){ const t=a%b; a=b; b=t; }
  return a;
}

export function mandelbrotEscape(cr, ci, maxSteps=32) {
  let zr=0, zi=0;
  for(let i=0;i<maxSteps;i++){
    const nr=zr*zr-zi*zi+cr;
    const ni=2*zr*zi+ci;
    zr=nr; zi=ni;
    if(zr*zr+zi*zi>4) return i+1;
  }
  return maxSteps;
}

export const TASKS = {
  mandelbrot:{dim:8,maxSteps:32,safety:8},
  gcd:{dim:8,maxSteps:24,safety:2},
  sort4:{dim:10,maxSteps:12,safety:3},
  parity:{dim:8,maxSteps:24,safety:3}
};

export function makeInstance(taskId, rng, split='search') {
  if(taskId==='mandelbrot'){
    const cr=-2.0+rng()*2.8;
    const ci=-1.2+rng()*2.4;
    return {taskId,split,cr,ci,truthEscape:mandelbrotEscape(cr,ci,32)};
  }
  if(taskId==='gcd'){
    const a=randint(rng,2,100), b=randint(rng,2,100);
    return {taskId,split,a,b,truth:gcdInt(a,b)};
  }
  if(taskId==='sort4'){
    const values=Array.from({length:4},()=>Math.round((-1+rng()*2)*1000)/1000);
    return {taskId,split,values,truth:values.slice().sort((a,b)=>a-b)};
  }
  if(taskId==='parity'){
    const min=split==='search'?3:5;
    const max=split==='search'?13:21;
    const length=randint(rng,min,max);
    const bits=Array.from({length},()=>rng()<0.5?0:1);
    const truth=bits.reduce((a,b)=>a^b,0);
    return {taskId,split,bits,length,truth};
  }
  throw new Error(`unknown task ${taskId}`);
}

export function initialState(taskId, instance) {
  if(taskId==='mandelbrot') return [0,0,instance.cr,instance.ci,0,1,0,1];
  if(taskId==='gcd'){
    const a=instance.a/100, b=instance.b/100;
    return [a,b,a,b,a,0,0,1];
  }
  if(taskId==='sort4') return [...instance.values,...instance.values,0,1];
  if(taskId==='parity') return [instance.bits[0]||0,0,0,instance.length/20,0,0,0,1];
  throw new Error(`unknown task ${taskId}`);
}

export function applyEnvironment(taskId, instance, state, step) {
  const s=state.slice();
  if(taskId==='mandelbrot'){
    s[2]=instance.cr; s[3]=instance.ci; s[4]=(step+1)/TASKS.mandelbrot.maxSteps; s[7]=1;
  } else if(taskId==='gcd'){
    s[0]=instance.a/100; s[1]=instance.b/100; s[5]=(step+1)/TASKS.gcd.maxSteps; s[7]=1;
  } else if(taskId==='sort4'){
    for(let i=0;i<4;i++) s[i]=instance.values[i];
    s[8]=(step+1)/TASKS.sort4.maxSteps; s[9]=1;
  } else if(taskId==='parity'){
    const nextIndex=Math.min(step+1,instance.length);
    s[0]=nextIndex<instance.length?instance.bits[nextIndex]:0;
    s[2]=nextIndex/Math.max(1,instance.length);
    s[3]=instance.length/20;
    s[4]=nextIndex>=instance.length?1:0;
    s[7]=1;
  }
  const lim=TASKS[taskId].safety;
  for(let i=0;i<s.length;i++) s[i]=Number.isFinite(s[i])?clamp(s[i],-lim,lim):0;
  return s;
}

export function readAnswer(taskId, instance, state, trace=null) {
  if(taskId==='mandelbrot'){
    if(trace){
      for(let i=1;i<trace.length;i++){
        const z=trace[i];
        if(z[0]*z[0]+z[1]*z[1]>4) return Math.min(32,i);
      }
    }
    return 32;
  }
  if(taskId==='gcd') return Math.max(0,Math.round(Math.abs(state[4])*100));
  if(taskId==='sort4') return state.slice(4,8);
  if(taskId==='parity') return state[1]>=0.5?1:0;
  throw new Error(`unknown task ${taskId}`);
}

export function scoreState(taskId, instance, state, trace=null) {
  if(taskId==='mandelbrot'){
    const pred=readAnswer(taskId,instance,state,trace);
    const err=Math.abs(pred-instance.truthEscape)/32;
    return clamp(1-err,0,1);
  }
  if(taskId==='gcd'){
    const pred=readAnswer(taskId,instance,state);
    const rel=Math.abs(pred-instance.truth)/Math.max(1,instance.truth);
    return clamp(1-rel,0,1) * (pred===instance.truth?1:0.92);
  }
  if(taskId==='sort4'){
    const pred=readAnswer(taskId,instance,state);
    let mse=0, inversions=0;
    for(let i=0;i<4;i++) mse+=(pred[i]-instance.truth[i])**2;
    mse/=4;
    for(let i=0;i<3;i++) if(pred[i]>pred[i+1]) inversions++;
    const valueScore=Math.exp(-4*mse);
    const orderScore=1-inversions/3;
    return clamp(0.75*valueScore+0.25*orderScore,0,1);
  }
  if(taskId==='parity'){
    const raw=clamp(state[1],0,1);
    const target=instance.truth;
    const soft=1-Math.abs(raw-target);
    const exact=readAnswer(taskId,instance,state)===target;
    return clamp(exact?0.85+0.15*soft:0.75*soft,0,1);
  }
  throw new Error(`unknown task ${taskId}`);
}

export function isTerminal(taskId, instance, state, step) {
  if(taskId==='mandelbrot') return state[0]*state[0]+state[1]*state[1]>4 || step+1>=32;
  if(taskId==='gcd') return state[6]>0.5 || step+1>=TASKS.gcd.maxSteps;
  if(taskId==='sort4') return step+1>=TASKS.sort4.maxSteps;
  if(taskId==='parity') return step+1>=instance.length;
  return true;
}

export function referenceScore(){ return 1; }

export function exactSuccess(taskId, instance, state, trace=null) {
  if(taskId==='mandelbrot') return readAnswer(taskId,instance,state,trace)===instance.truthEscape;
  if(taskId==='gcd') return readAnswer(taskId,instance,state)===instance.truth;
  if(taskId==='sort4'){
    const p=readAnswer(taskId,instance,state);
    return p.every((v,i)=>nearly(v,instance.truth[i],1e-2));
  }
  if(taskId==='parity') return readAnswer(taskId,instance,state)===instance.truth;
  return false;
}
