import { makeRng,shuffle } from './prng.js';

const mean=xs=>xs.reduce((a,b)=>a+b,0)/Math.max(1,xs.length);
const sq=x=>x*x;

function solveLinear(M,y){
  const n=M.length,A=M.map((r,i)=>r.slice().concat([y[i]]));
  for(let c=0;c<n;c++){
    let p=c; for(let r=c+1;r<n;r++) if(Math.abs(A[r][c])>Math.abs(A[p][c])) p=r;
    if(Math.abs(A[p][c])<1e-12) A[p][c]+=1e-8;
    [A[c],A[p]]=[A[p],A[c]];
    const d=A[c][c]||1e-8; for(let j=c;j<=n;j++) A[c][j]/=d;
    for(let r=0;r<n;r++) if(r!==c){ const f=A[r][c]; if(!f) continue; for(let j=c;j<=n;j++) A[r][j]-=f*A[c][j]; }
  }
  return A.map(r=>r[n]);
}

function feature(s){ return s.state.concat(s.input); }
function fitAffine(samples,ridge=1e-5){
  const p=feature(samples[0]).length+1,outDim=samples[0].control.length;
  const XtX=Array.from({length:p},()=>Array(p).fill(0));
  const XtY=Array.from({length:p},()=>Array(outDim).fill(0));
  for(const s of samples){
    const x=feature(s).concat([1]);
    for(let i=0;i<p;i++){
      for(let j=0;j<p;j++) XtX[i][j]+=x[i]*x[j];
      for(let o=0;o<outDim;o++) XtY[i][o]+=x[i]*s.control[o];
    }
  }
  for(let i=0;i<p;i++) XtX[i][i]+=ridge;
  const W=Array.from({length:outDim},()=>Array(p-1).fill(0)),b=Array(outDim).fill(0);
  for(let o=0;o<outDim;o++){
    const beta=solveLinear(XtX,XtY.map(r=>r[o]));
    for(let j=0;j<p-1;j++) W[o][j]=beta[j]; b[o]=beta[p-1];
  }
  return {W,b};
}
function predict(m,s){
  const x=feature(s);
  return m.W.map((r,i)=>Math.tanh(r.reduce((a,w,j)=>a+w*x[j],m.b[i])));
}
function mseModel(m,samples){
  if(!samples.length) return 0;
  let e=0,n=0;
  for(const s of samples){ const p=predict(m,s); for(let i=0;i<p.length;i++){ e+=sq(p[i]-s.control[i]); n++; } }
  return e/Math.max(1,n);
}
function stats(samples){
  const d=samples[0].state.length,di=samples[0].input.length;
  const prototype=Array(d).fill(0),inputPrototype=Array(di).fill(0);
  for(const s of samples){ for(let i=0;i<d;i++) prototype[i]+=s.state[i]; for(let i=0;i<di;i++) inputPrototype[i]+=s.input[i]; }
  for(let i=0;i<d;i++) prototype[i]/=samples.length; for(let i=0;i<di;i++) inputPrototype[i]/=samples.length;
  const scale=Array(d).fill(0),inputScale=Array(di).fill(0);
  for(const s of samples){ for(let i=0;i<d;i++) scale[i]+=sq(s.state[i]-prototype[i]); for(let i=0;i<di;i++) inputScale[i]+=sq(s.input[i]-inputPrototype[i]); }
  for(let i=0;i<d;i++) scale[i]=Math.max(.05,Math.sqrt(scale[i]/samples.length));
  for(let i=0;i<di;i++) inputScale[i]=Math.max(.05,Math.sqrt(inputScale[i]/samples.length));
  const tmp={prototype,scale,inputPrototype,inputScale};
  const ds=samples.map(s=>controlSourceResidual(tmp,s.state,s.input)).sort((a,b)=>a-b);
  const threshold=Math.max(.55,ds[Math.floor(.95*(ds.length-1))]+.15);
  return {...tmp,threshold};
}
function makeMotif(samples,id){
  const m=fitAffine(samples),st=stats(samples);
  return {id,...m,...st,count:samples.length,trainSolvers:[...new Set(samples.map(s=>s.solver).filter(Boolean))].sort()};
}
export function controlSourceResidual(m,state,input){
  let e=0,n=0;
  for(let i=0;i<state.length;i++){ e+=sq((state[i]-m.prototype[i])/(m.scale[i]||.05)); n++; }
  for(let i=0;i<input.length;i++){ e+=sq((input[i]-m.inputPrototype[i])/(m.inputScale[i]||.05)); n++; }
  return Math.sqrt(e/Math.max(1,n));
}
export function routeControlMotif(motifs,state,input){
  let best=null;
  for(const m of motifs){ const r=controlSourceResidual(m,state,input); if(!best||r<best.residual) best={motif:m,residual:r}; }
  return best&&best.residual<=best.motif.threshold?best:null;
}
function routedMse(motifs,samples){
  let e=0,n=0;
  for(const s of samples){ const r=routeControlMotif(motifs,s.state,s.input)||{motif:motifs.reduce((a,m)=>controlSourceResidual(m,s.state,s.input)<controlSourceResidual(a,s.state,s.input)?m:a)}; const p=predict(r.motif,s); for(let i=0;i<p.length;i++){ e+=sq(p[i]-s.control[i]); n++; } }
  return e/Math.max(1,n);
}
function splitCandidate(cluster){
  if(cluster.length<10) return null;
  const feats=cluster.map(feature),d=feats[0].length;
  let bestJ=0,bestV=-1;
  for(let j=0;j<d;j++){ const mu=mean(feats.map(x=>x[j])); const v=mean(feats.map(x=>sq(x[j]-mu))); if(v>bestV){bestV=v;bestJ=j;} }
  const sorted=feats.map(x=>x[bestJ]).sort((a,b)=>a-b),cut=sorted[Math.floor(sorted.length/2)];
  const left=[],right=[]; for(const s of cluster) (feature(s)[bestJ]<=cut?left:right).push(s);
  return left.length>=4&&right.length>=4?[left,right]:null;
}
export function compressControls(samples,{maxMotifs=12,validationFraction=.25,seed=1}={}){
  if(samples.length<6) throw new Error('need at least six control samples');
  const shuffled=shuffle(makeRng(seed),samples),nVal=Math.max(1,Math.floor(samples.length*validationFraction));
  const val=shuffled.slice(0,nVal),train=shuffled.slice(nVal);
  const globalMap=makeMotif(train,'global');
  let clusters=[train],motifs=[makeMotif(train,0)],best=routedMse(motifs,val);
  while(clusters.length<maxMotifs){
    let accepted=null;
    for(let i=0;i<clusters.length;i++){
      const sp=splitCandidate(clusters[i]); if(!sp) continue;
      const cs=clusters.slice(0,i).concat(sp,clusters.slice(i+1));
      const ms=cs.map((c,j)=>makeMotif(c,j)),score=routedMse(ms,val);
      if(score<best*.98&&(!accepted||score<accepted.score)) accepted={clusters:cs,motifs:ms,score};
    }
    if(!accepted) break;
    clusters=accepted.clusters; motifs=accepted.motifs; best=accepted.score;
  }
  if(motifs.length===1&&maxMotifs>1){
    const sp=splitCandidate(train);
    if(sp){ const ms=sp.map((c,j)=>makeMotif(c,j)); if(routedMse(ms,train)<routedMse(motifs,train)*.85){ motifs=ms; best=routedMse(ms,val); } }
  }
  return {motifs,globalMap,validation:{mseMotifs:best,mseGlobal:mseModel(globalMap,val),count:val.length}};
}
export function predictControlFromMotif(motif,state,input){ return predict(motif,{state,input}); }
export function controlSamplesFromTraces(traces){
  const out=[];
  for(const t of traces) for(let i=0;i<t.controls.length;i++) out.push({state:t.states[i].slice(),input:t.inputs[i].slice(),control:t.controls[i].slice(),solver:t.solver,taskId:t.taskId,traceScore:t.score});
  return out;
}
