import { routeControlMotif,predictControlFromMotif,controlSourceResidual } from './control_compress.js';
import { stepSubstrate } from './causal_substrate.js';
import { scoreControlEpisode } from './control_tasks.js';

function nearestMotif(motifs,state,input){
  let best=null;
  for(const m of motifs){ const r=controlSourceResidual(m,state,input); if(!best||r<best.residual) best={motif:m,residual:r}; }
  return best;
}

export function executeControlMotifs({taskId,instance,motifs,substrate,globalMap=null,routing='motif',nearestSamples=null}){
  let state=Array(substrate.n).fill(0),unknown=false;
  const trajectory=[state.slice()],controls=[],inputs=[],route=[],stepMeta=[];
  for(const inp of instance.inputs){
    let control,info=null;
    if(routing==='zero') control=Array(substrate.nsite).fill(0);
    else if(routing==='global') { info={motif:globalMap,residual:0}; control=predictControlFromMotif(globalMap,state,inp); }
    else if(routing==='nearest'){
      let b=null;
      for(const s of nearestSamples||[]){
        let e=0,n=0; for(let i=0;i<state.length;i++){e+=(state[i]-s.state[i])**2;n++;} for(let i=0;i<inp.length;i++){e+=(inp[i]-s.input[i])**2;n++;}
        const d=Math.sqrt(e/Math.max(1,n)); if(!b||d<b.d)b={d,s};
      }
      control=b?b.s.control.slice():Array(substrate.nsite).fill(0); info=b?{motif:{id:'nearest'},residual:b.d}:null;
    } else {
      info=routeControlMotif(motifs,state,inp);
      if(!info){ unknown=true; route.push({modeId:'UNKNOWN',residual:null}); break; }
      control=predictControlFromMotif(info.motif,state,inp);
    }
    const step=stepSubstrate(substrate,state,control);
    controls.push(step.control.slice()); inputs.push(inp.slice());
    route.push({modeId:info?.motif?.id??routing,residual:info?.residual??0});
    stepMeta.push({converged:step.converged,iterations:step.iterations,residual:step.residual,safetyClamped:step.safetyClamped});
    state=step.state; trajectory.push(state.slice());
    if(!step.converged) break;
  }
  const scored=scoreControlEpisode(instance,state);
  return {taskId,state,trajectory,controls,inputs,route,stepMeta,unknown,...scored};
}
