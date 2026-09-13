import { runV2V3Experiment } from './v2_experiment.js';

const $=id=>document.getElementById(id);
let currentReport=null;
const fmt=(x,n=3)=>x==null?'—':Number.isFinite(Number(x))?Number(x).toFixed(n):'—';

function gateText(k){
  return ({gate0:'Local compression',gate1:'Compiled execution',gate2:'Search compressed',gate3:'Routing matters',gate4:'Cross-solver reuse',gate5:'Explanation fidelity',gate6:'Autonomy gap localized',gate7:'Successor routing improves',gate8:'Causal substrate valid',gate9:'Search finds controllable tasks',gate10:'Control compression generalizes',gate11:'Composition survives horizon',gate12:'Local legality ≠ global correctness',gate13:'Global monitor detects failures'})[k]||k;
}

function renderGates(report){
  const grid=$('gate-grid'); grid.innerHTML='';
  for(const [k,g] of Object.entries(report.gates||{})){
    const d=document.createElement('div'); d.className='gate';
    d.innerHTML=`<b>${k.toUpperCase()} · ${gateText(k)}</b><div class="${g.pass?'pass':'fail'} resultBig">${g.pass?'PASS':'FAIL'}</div>`;
    grid.appendChild(d);
  }
}

function renderScore(report){
  const body=$('score-body'); body.innerHTML='';
  for(const [id,t] of Object.entries(report.tasks||{})){
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${id}</td><td>${fmt(t.search.evolution.bestScore)}</td><td>${fmt(t.search.anneal.bestScore)}</td><td>${t.compression.modeCount}</td><td>${fmt(t.compression.nmseModes,4)}</td><td>${fmt(t.compression.nmseGlobal,4)}</td><td>${fmt(t.execution.compiledScore)}</td><td>${fmt(t.successorExecution?.score)}</td><td>${fmt(t.execution.globalScore)}</td><td>${fmt(t.execution.compiledExact)}</td>`;
    body.appendChild(tr);
  }
}

function interpForMode(task,modeId){ return task.interpretation?.modes?.find(m=>String(m.modeId)===String(modeId)); }
function renderModes(report){
  const id=$('task-select').value, t=report.tasks[id];
  $('mode-summary').textContent=`${t.compression.modeCount} modes · local NMSE ${fmt(t.compression.nmseModes,4)} vs global ${fmt(t.compression.nmseGlobal,4)}`;
  const grid=$('mode-grid'); grid.innerHTML='';
  for(const m of t.modes){
    const it=interpForMode(t,m.id)||{};
    const card=document.createElement('div'); card.className='mode';
    const solvers=(m.trainSolvers||[]).join(', ')||'—';
    card.innerHTML=`<h4><span>Mode ${m.id}</span><span class="${it.name&&it.name!=='UNNAMED'?'pass':'neutral'}">${it.name||'UNNAMED'}</span></h4>
      <div class="kv"><span>source threshold</span><b>${fmt(m.threshold)}</b><span>trace transitions</span><b>${m.count}</b><span>search generators</span><b>${solvers}</b><span>post-hoc R²</span><b>${fmt(it.bestR2,4)}</b><span>rank proxy</span><b>${it.effectiveRank??'—'}</b></div>`;
    grid.appendChild(card);
  }
}

function renderRoute(report){
  const id=$('task-select').value,t=report.tasks[id],route=t.execution.sampleRoute||[];
  const box=$('route-view'); box.innerHTML='';
  if(!route.length){box.textContent='No route recorded.';return;}
  for(const r of route){
    const s=document.createElement('span'); s.className='chip'+(r.modeId==='UNKNOWN'?' unknown':'');
    s.textContent=r.modeId==='UNKNOWN'?'UNKNOWN':`M${r.modeId}`; box.appendChild(s);
  }
  $('route-note').textContent=route.some(r=>r.modeId==='UNKNOWN')?'The frozen router reached a state outside every learned applicability region. It stopped rather than inventing a mode.':'Every recorded step found an applicable learned mode.';
}


function renderAutopsy(report){
  const id=$('task-select').value, t=report.tasks[id], a=t.autopsy||{};
  $('autopsy-summary').textContent=`${a.dominantFailure||'unavailable'} · teacher endogenous ${fmt(a.teacherOneStepEndogenous,5)} · oracle ${fmt(a.oracleOneStepEndogenous,5)} · ${a.eligibleTransitions??0} transitions`;
  const body=$('autopsy-table'); body.innerHTML='';
  const horizons=a.horizons||{};
  for(const h of [1,2,4,8,16,32]){
    const x=horizons[h]||horizons[String(h)]; if(!x) continue;
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${h}</td><td>${fmt(x.fixedEndogenous,5)}</td><td>${fmt(x.freeEndogenous,5)}</td><td>${fmt(x.oracleEndogenous,5)}</td><td>${fmt(x.manifoldSurvival,3)}</td><td>${fmt(x.unknownRate,3)}</td>`;
    body.appendChild(tr);
  }
  if(!body.children.length){ const tr=document.createElement('tr'); tr.innerHTML='<td colspan="6" class="small">No eligible successful trace horizons.</td>'; body.appendChild(tr); }
}

function renderSuccessor(report){
  const id=$('task-select').value, t=report.tasks[id], e=t.successorExecution||{}, graph=t.successorGraph||{};
  const gain=(Number(e.score)-Number(e.sourceOnlyScore));
  $('successor-score').textContent=`source ${fmt(e.sourceOnlyScore)} → successor ${fmt(e.score)} (Δ ${fmt(gain)}) · global ${fmt(e.globalScore)}`;
  const edges=$('successor-edges'); edges.innerHTML='';
  for(const edge of (graph.edges||[]).slice(0,12)){
    const chip=document.createElement('span'); chip.className='chip';
    chip.textContent=`M${edge.from} → M${edge.to}  p=${fmt(edge.prob,2)}`;
    chip.title=`observed ${edge.count} times`;
    edges.appendChild(chip);
  }
  if(!edges.children.length) edges.textContent='No repeated successor edges learned.';
  const route=$('successor-route'); route.innerHTML='';
  for(const r of (e.sampleRoute||[])){
    const chip=document.createElement('span'); chip.className='chip'+(r.modeId==='UNKNOWN'?' unknown':'');
    if(r.modeId==='UNKNOWN') chip.textContent='UNKNOWN';
    else chip.textContent=`M${r.modeId}${r.expectedSuccessorId==null?'':` → M${r.expectedSuccessorId}`}`;
    if(Number.isFinite(r.continuationCost)) chip.title=`continuation cost ${fmt(r.continuationCost,3)} · source ${fmt(r.sourceCost,3)} · destination ${fmt(r.destCost,3)} · prior ${fmt(r.prior,3)}`;
    route.appendChild(chip);
  }
  if(!route.children.length) route.textContent='No successor route recorded.';
}

function colorFor(v,max=32){
  const t=Math.max(0,Math.min(1,v/max));
  const r=Math.round(40+200*t), g=Math.round(30+120*(1-Math.abs(t-.5)*2)), b=Math.round(120+120*(1-t));
  return `rgb(${r},${g},${b})`;
}
function drawMap(canvas,data,side){
  const ctx=canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height);
  if(!data?.length||!side) return;
  const cw=canvas.width/side,ch=canvas.height/side;
  for(let y=0;y<side;y++) for(let x=0;x<side;x++){ ctx.fillStyle=colorFor(data[y*side+x]); ctx.fillRect(x*cw,y*ch,cw+.5,ch+.5); }
}

function renderV2(report){
  const c=report.causalControl;
  if(!c) return;
  const gates=$('v2-gates'); gates.innerHTML='';
  for(const k of ['gate8','gate9','gate10','gate11']){
    const g=report.gates?.[k]; if(!g) continue;
    const d=document.createElement('div'); d.className='gate';
    d.innerHTML=`<b>${k.toUpperCase()} · ${gateText(k)}</b><div class="${g.pass?'pass':'fail'} resultBig">${g.pass?'PASS':'FAIL'}</div>`;
    gates.appendChild(d);
  }
  const body=$('v2-task-table'); body.innerHTML='';
  for(const [id,t] of Object.entries(c.tasks||{})){
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${id}</td><td>${fmt(t.search.score)}</td><td>${fmt(t.search.exact)}</td><td>${t.compiled.motifCount}</td><td>${fmt(t.compiled.score)}</td><td>${fmt(t.compiled.globalScore)}</td><td>${fmt(t.compiled.nearestScore)}</td><td>${fmt(t.compiled.zeroScore)}</td><td>${fmt(t.compiled.unknownRate)}</td>`;
    body.appendChild(tr);
  }
  const motif=$('v2-motif-view'); motif.innerHTML='';
  for(const [id,t] of Object.entries(c.tasks||{})){
    const chip=document.createElement('span'); chip.className='chip';
    chip.textContent=`${id}: ${t.compiled.usedMotifs}/${t.compiled.motifCount} used`;
    motif.appendChild(chip);
  }
  const hv=$('v2-horizon-view'); hv.innerHTML='';
  for(const [id,t] of Object.entries(c.tasks||{})){
    const d=document.createElement('div');
    d.textContent=`${id}: h1 ${fmt(t.horizon.h1,4)} · h8 ${fmt(t.horizon.h8,4)} · abstain ${fmt(t.horizon.earlyAbstentionRate,3)}`;
    hv.appendChild(d);
  }
}

function renderV3(report){
  const g=report.globalConsistency;
  if(!g||!Array.isArray(g.episodes)) return;
  const m=g.monitor||{};
  $('v3-monitor-summary').textContent=`threshold ${fmt(m.threshold,3)} · bad recall ${fmt(m.badRecall,3)} · false positive ${fmt(m.falsePositiveRate,3)}`;
  const body=$('v3-loop-table'); body.innerHTML='';
  for(const e of g.episodes){
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${e.name}</td><td class="${e.localLegal?'pass':'fail'}">${e.localLegal?'YES':'NO'}</td><td>${fmt(e.readoutClosure,4)}</td><td>${fmt(e.invariantClosure,4)}</td><td class="${e.closureError>0.10?'fail':'pass'}">${fmt(e.closureError,4)}</td>`;
    body.appendChild(tr);
  }
}

function renderMandel(report){
  const t=report.tasks.mandelbrot,e=t.execution;
  drawMap($('truth-canvas'),e.truthEscape,e.gridSide); drawMap($('compiled-canvas'),e.compiledEscape,e.gridSide);
  $('mandel-metrics').textContent=`compiled corr ${fmt(e.mandelbrotCorr,3)} · normalized MAE ${fmt(e.mandelbrotNmae,3)} · global MAE ${fmt(e.globalNmae,3)}`;
  const c=report.controls.mandelbrotImitation;
  $('control-note').textContent=`${c.label}: corr ${fmt(c.correlation,3)}, normalized MAE ${fmt(c.normalizedMae,3)}.`;
}

function render(report){
  currentReport=report;
  $('engineering-status').textContent=`Engineering ${report.engineering?.ok?'OK':'ERROR'} · seed ${report.config?.seed} · budget ${report.config?.budget} · ${report.config?.evalScale}`;
  renderGates(report); renderScore(report); renderModes(report); renderRoute(report); renderAutopsy(report); renderSuccessor(report); renderMandel(report); renderV2(report); renderV3(report);
  $('compress').disabled=false; $('execute').disabled=false;
}

async function loadReceipt(){
  try{ const r=await fetch('./results/default.json',{cache:'no-store'}); if(!r.ok) throw new Error(`HTTP ${r.status}`); render(await r.json()); }
  catch(err){ $('engineering-status').textContent=`Committed receipt unavailable: ${err.message}`; }
}

$('task-select').addEventListener('change',()=>{if(currentReport){renderModes(currentReport);renderRoute(currentReport);renderAutopsy(currentReport);renderSuccessor(currentReport);}});
$('compress').addEventListener('click',()=>{if(currentReport)renderModes(currentReport);});
$('execute').addEventListener('click',()=>{if(currentReport){renderRoute(currentReport);renderAutopsy(currentReport);renderSuccessor(currentReport);renderMandel(currentReport);}});
$('run-search').addEventListener('click',()=>{
  const btn=$('run-search'); btn.disabled=true; $('engineering-status').textContent='Running deterministic search/compression/execution…';
  setTimeout(()=>{
    try{
      const seed=Number($('seed').value)||17, budget=Math.max(24,Number($('budget').value)||4000);
      const liveBudget=Math.min(400,budget);
      const report=runV2V3Experiment({seed,v1Budget:Math.min(120,liveBudget),controlBudget:liveBudget,controlInstances:10,controlEvalCount:liveBudget>=200?32:12,evalScale:liveBudget>=200?'receipt':'smoke',includeV3:true});
      render(report);
    }catch(err){ $('engineering-status').textContent=`Run failed: ${err.message}`; console.error(err); }
    finally{btn.disabled=false;}
  },20);
});

loadReceipt();
