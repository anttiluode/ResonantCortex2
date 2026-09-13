import { randint } from './prng.js';
import { applyControlPolicy } from './control_policy.js';
import { stepSubstrate } from './causal_substrate.js';

export const CONTROL_TASKS={
  toggle:{inputDim:3},delay:{inputDim:3},pattern:{inputDim:3},switch:{inputDim:3}
};

function zeroInputs(n){ return Array.from({length:n},()=>[0,0,0]); }
function uniqueTimes(rng,count,lo,hi){
  const s=new Set();
  while(s.size<count) s.add(randint(rng,lo,hi));
  return [...s].sort((a,b)=>a-b);
}

export function makeControlInstance(taskId,rng,split='search'){
  if(taskId==='toggle'){
    const length=split==='search'?randint(rng,8,13):randint(rng,16,22);
    const count=split==='search'?randint(rng,2,6):randint(rng,5,10);
    const times=uniqueTimes(rng,Math.min(count,length-3),1,length-2);
    const inputs=zeroInputs(length);
    for(const t of times) inputs[t][0]=1;
    return {taskId,split,length,times,inputs,target:(times.length%2)?1:-1};
  }
  if(taskId==='delay'){
    const delay=split==='search'?randint(rng,5,9):randint(rng,12,17);
    const amp=(rng()<.5?-1:1)*(split==='search'?1:0.70+0.50*rng());
    const length=delay+3,inputs=zeroInputs(length); inputs[1][1]=amp;
    return {taskId,split,delay,length,amp,inputs,target:Math.sign(amp)};
  }
  if(taskId==='pattern'){
    const gap=split==='search'?randint(rng,3,6):randint(rng,5,10);
    const first=2, second=first+gap, length=second+5;
    const cls=rng()<.5?1:-1, scale=split==='search'?1:0.75+0.5*rng();
    const inputs=zeroInputs(length);
    if(cls>0){ inputs[first][0]=scale; inputs[second][1]=scale; }
    else { inputs[first][1]=scale; inputs[second][0]=scale; }
    return {taskId,split,gap,length,cls,scale,inputs,target:cls};
  }
  if(taskId==='switch'){
    const gap=split==='search'?randint(rng,4,7):randint(rng,8,13);
    const context=rng()<.5?-1:1;
    const a=rng()<.5?-1:1, b=rng()<.5?-1:1;
    const scale=split==='search'?1:0.75+0.5*rng();
    const signalTime=2+gap,length=signalTime+5,inputs=zeroInputs(length);
    inputs[1][0]=context;
    inputs[signalTime][1]=a*scale; inputs[signalTime][2]=b*scale;
    return {taskId,split,gap,length,context,a,b,scale,signalTime,inputs,target:context>0?a:b};
  }
  throw new Error(`unknown control task ${taskId}`);
}

export function controlReadout(state){
  return Math.tanh(0.85*state[4]+0.25*(state[2]-state[6]));
}

export function scoreControlEpisode(instance,state){
  const y=controlReadout(state), target=instance.target;
  const exact=(y>=0?1:-1)===target;
  const soft=Math.max(0,1-Math.abs(y-target)/2);
  return {score:0.70*soft+0.30*(exact?1:0),exact,readout:y,target};
}

export function runControlPolicy({taskId,instance,policy,substrate}){
  let state=Array(substrate.n).fill(0);
  const trajectory=[state.slice()],controls=[],inputs=[],stepMeta=[];
  let failed=false;
  for(const inp of instance.inputs){
    const u=applyControlPolicy(policy,state,inp);
    const step=stepSubstrate(substrate,state,u);
    controls.push(step.control.slice()); inputs.push(inp.slice()); stepMeta.push({converged:step.converged,iterations:step.iterations,residual:step.residual,safetyClamped:step.safetyClamped});
    if(!step.converged||!step.state.every(Number.isFinite)){ failed=true; state=step.state; trajectory.push(state.slice()); break; }
    state=step.state; trajectory.push(state.slice());
  }
  const result=failed?{score:0,exact:false,readout:0,target:instance.target}:scoreControlEpisode(instance,state);
  return {state,trajectory,controls,inputs,stepMeta,...result};
}
