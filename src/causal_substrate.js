const clip=(x,a,b)=>Math.max(a,Math.min(b,x));
const cloneM=M=>M.map(r=>r.slice());

function solveLinear(M,y){
  const n=M.length;
  const A=M.map((r,i)=>r.slice().concat([y[i]]));
  for(let c=0;c<n;c++){
    let p=c;
    for(let r=c+1;r<n;r++) if(Math.abs(A[r][c])>Math.abs(A[p][c])) p=r;
    if(Math.abs(A[p][c])<1e-14) throw new Error('singular matrix');
    [A[c],A[p]]=[A[p],A[c]];
    const d=A[c][c];
    for(let j=c;j<=n;j++) A[c][j]/=d;
    for(let r=0;r<n;r++) if(r!==c){
      const f=A[r][c];
      if(f===0) continue;
      for(let j=c;j<=n;j++) A[r][j]-=f*A[c][j];
    }
  }
  return A.map(r=>r[n]);
}

function invertSolve(A,RHS){
  const n=A.length, m=RHS[0].length;
  const out=Array.from({length:n},()=>Array(m).fill(0));
  for(let j=0;j<m;j++){
    const col=solveLinear(A,RHS.map(r=>r[j]));
    for(let i=0;i<n;i++) out[i][j]=col[i];
  }
  return out;
}

function matVec(M,x){ return M.map(r=>r.reduce((s,v,j)=>s+v*x[j],0)); }

export function compilePassiveGraph({G,C,siteNodes,dt}){
  const n=C.length;
  if(!Number.isFinite(dt)||dt<=0) throw new Error('dt must be positive');
  if(G.length!==n||G.some(r=>r.length!==n)) throw new Error('G shape mismatch');
  if(C.some(v=>!Number.isFinite(v)||v<=0)) throw new Error('capacities must be positive');
  const D=C.map(v=>v/dt);
  const A=G.map((r,i)=>r.map((v,j)=>v+(i===j?D[i]:0)));
  const B=Array.from({length:n},()=>Array(siteNodes.length).fill(0));
  for(let k=0;k<siteNodes.length;k++) B[siteNodes[k]][k]=1;
  const rhs=Array.from({length:n},(_,i)=>[
    ...Array.from({length:n},(_,j)=>i===j?D[i]:0),
    ...B[i]
  ]);
  const solved=invertSolve(A,rhs);
  return {P:solved.map(r=>r.slice(0,n)),X:solved.map(r=>r.slice(n))};
}

function defaultGraph(){
  const n=9, edge=0.12, leak=0.03;
  const G=Array.from({length:n},()=>Array(n).fill(0));
  for(let i=0;i<n;i++) G[i][i]+=leak;
  const add=(a,b,g)=>{ G[a][a]+=g; G[b][b]+=g; G[a][b]-=g; G[b][a]-=g; };
  for(let i=0;i<n-1;i++) add(i,i+1,edge);
  add(1,4,0.07); add(4,7,0.07); add(0,8,0.04);
  return {G,C:Array(n).fill(1.5),siteNodes:[2,4,6],dt:0.2};
}

export function makeDefaultSubstrate(){
  const graph=defaultGraph();
  const {P,X}=compilePassiveGraph(graph);
  const constants={gain:2.5,feedback:1.1,currentLeak:0.08,maxIterations:12,tolerance:1e-10,maxBacktrack:8,safety:6};
  return Object.freeze({
    n:graph.C.length,
    nsite:graph.siteNodes.length,
    siteNodes:Object.freeze(graph.siteNodes.slice()),
    P:Object.freeze(P.map(r=>Object.freeze(r.slice()))),
    X:Object.freeze(X.map(r=>Object.freeze(r.slice()))),
    constants:Object.freeze({...constants}),
    graph:Object.freeze({G:Object.freeze(graph.G.map(r=>Object.freeze(r.slice()))),C:Object.freeze(graph.C.slice()),dt:graph.dt})
  });
}

export function serializeSubstrate(s){
  return {
    n:s.n,nsite:s.nsite,siteNodes:[...s.siteNodes],
    P:s.P.map(r=>[...r]),X:s.X.map(r=>[...r]),
    constants:{...s.constants},
    graph:{G:s.graph.G.map(r=>[...r]),C:[...s.graph.C],dt:s.graph.dt}
  };
}

function currentAndDerivative(z,u,c){
  const J=[],dJ=[];
  for(let i=0;i<z.length;i++){
    const tz=Math.tanh(z[i]);
    const a=u[i]+c.feedback*tz;
    const ta=Math.tanh(a);
    J[i]=c.gain*ta-c.currentLeak*z[i];
    dJ[i]=c.gain*(1-ta*ta)*c.feedback*(1-tz*tz)-c.currentLeak;
  }
  return {J,dJ};
}

function residualJac(substrate,passiveSites,z,u){
  const R=substrate.siteNodes.map(idx=>substrate.X[idx]);
  const {J,dJ}=currentAndDerivative(z,u,substrate.constants);
  const F=z.map((v,i)=>v-passiveSites[i]-R[i].reduce((s,r,k)=>s+r*J[k],0));
  const jac=Array.from({length:z.length},(_,i)=>Array.from({length:z.length},(_,j)=>(i===j?1:0)-R[i][j]*dJ[j]));
  return {F,jac,J};
}

function infNorm(x){ let m=0; for(const v of x)m=Math.max(m,Math.abs(v)); return m; }

export function stepSubstrate(substrate,state,control){
  if(!Array.isArray(state)||state.length!==substrate.n) throw new Error('state shape mismatch');
  if(!Array.isArray(control)||control.length!==substrate.nsite) throw new Error('control shape mismatch');
  const u=control.map(v=>clip(Number.isFinite(v)?v:0,-1,1));
  const passive=matVec(substrate.P,state);
  const passiveSites=substrate.siteNodes.map(i=>passive[i]);
  let z=passiveSites.slice(), converged=false, iterations=0, residual=Infinity;
  let lastJ=Array(substrate.nsite).fill(0);
  for(let it=0;it<=substrate.constants.maxIterations;it++){
    const r=residualJac(substrate,passiveSites,z,u);
    lastJ=r.J; residual=infNorm(r.F);
    if(residual<=substrate.constants.tolerance){ converged=true; iterations=it; break; }
    if(it===substrate.constants.maxIterations){ iterations=it; break; }
    let delta;
    try{ delta=solveLinear(r.jac,r.F); }catch{ iterations=it+1; break; }
    let accepted=false,alpha=1;
    for(let bt=0;bt<=substrate.constants.maxBacktrack;bt++){
      const cand=z.map((v,i)=>v-alpha*delta[i]);
      const rr=residualJac(substrate,passiveSites,cand,u);
      if(infNorm(rr.F)<residual){ z=cand; accepted=true; break; }
      alpha*=0.5;
    }
    if(!accepted){ iterations=it+1; break; }
  }
  const final=currentAndDerivative(z,u,substrate.constants); lastJ=final.J;
  const injected=matVec(substrate.X,lastJ);
  let safetyClamped=false;
  const next=passive.map((v,i)=>{
    const raw=v+injected[i];
    const cl=clip(Number.isFinite(raw)?raw:0,-substrate.constants.safety,substrate.constants.safety);
    if(cl!==raw) safetyClamped=true;
    return cl;
  });
  return {state:next,control:u,current:lastJ,siteState:z,converged,iterations,residual,safetyClamped};
}
