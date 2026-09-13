import { randn } from './prng.js';
import { TASKS, initialState, applyEnvironment, scoreState, isTerminal } from './tasks.js';

const sigmoid = x => x >= 0 ? 1/(1+Math.exp(-Math.min(x,60))) : Math.exp(Math.max(x,-60))/(1+Math.exp(Math.max(x,-60)));
const dot = (a,b) => { let s=0; for(let i=0;i<a.length;i++) s += a[i]*b[i]; return s; };

export function randomProgram(dim, rng, steps=2) {
  const out=[];
  for(let q=0;q<steps;q++){
    const A=Array.from({length:dim},()=>Array.from({length:dim},()=>randn(rng)*0.03));
    const b=Array.from({length:dim},()=>randn(rng)*0.03);
    const u=Array.from({length:dim},()=>randn(rng)*0.35);
    out.push({A,b,u,c:randn(rng)*0.15,k:2+4*rng()});
  }
  return {dim,steps:out};
}

export function cloneProgram(program){
  return {dim:program.dim,steps:program.steps.map(s=>({A:s.A.map(r=>r.slice()),b:s.b.slice(),u:s.u.slice(),c:s.c,k:s.k}))};
}

export function mutateProgram(program, rng, sigma=0.12) {
  const p=cloneProgram(program);
  const edits=1+Math.floor(rng()*Math.max(2,Math.sqrt(program.dim)));
  for(let e=0;e<edits;e++){
    const st=p.steps[Math.floor(rng()*p.steps.length)];
    const kind=Math.floor(rng()*5);
    if(kind===0){
      const i=Math.floor(rng()*p.dim), j=Math.floor(rng()*p.dim);
      st.A[i][j]+=randn(rng)*sigma;
    } else if(kind===1){
      st.b[Math.floor(rng()*p.dim)]+=randn(rng)*sigma;
    } else if(kind===2){
      st.u[Math.floor(rng()*p.dim)]+=randn(rng)*sigma;
    } else if(kind===3){
      st.c+=randn(rng)*sigma;
    } else {
      st.k=Math.max(0.25,Math.min(16,st.k+randn(rng)*sigma*4));
    }
  }
  return p;
}

export function applyProgramOnce(program, state) {
  let s=state.slice();
  for(const st of program.steps){
    const h=Array(program.dim).fill(0);
    for(let i=0;i<program.dim;i++){
      let v=st.b[i];
      const row=st.A[i];
      for(let j=0;j<program.dim;j++) v += row[j]*s[j];
      h[i]=v;
    }
    const g=sigmoid(st.k*(dot(st.u,s)+st.c));
    for(let i=0;i<program.dim;i++) s[i]+=g*h[i];
  }
  return s;
}

export function runProgram(program, taskId, instance, maxSteps=TASKS[taskId].maxSteps) {
  let state=initialState(taskId,instance);
  const trace=[state.slice()];
  for(let step=0; step<maxSteps; step++){
    state=applyProgramOnce(program,state);
    state=applyEnvironment(taskId,instance,state,step);
    trace.push(state.slice());
    if(isTerminal(taskId,instance,state,step)) break;
  }
  const score=scoreState(taskId,instance,state,trace);
  return {state,trace,score,steps:trace.length-1};
}

export function programParameterCount(program){
  return program.steps.reduce((n,s)=>n+s.A.length*s.A[0].length+s.b.length+s.u.length+2,0);
}
