import { runExperiment } from './experiment.js';

const $=id=>document.getElementById(id);
let currentReport=null;
const fmt=(x,n=3)=>x==null?'—':Number.isFinite(Number(x))?Number(x).toFixed(n):'—';

function gateText(k){
  return ({gate0:'Local compression',gate1:'Compiled execution',gate2:'Search compressed',gate3:'Routing matters',gate4:'Cross-solver reuse',gate5:'Explanation fidelity'})[k]||k;
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
    tr.innerHTML=`<td>${id}</td><td>${fmt(t.search.evolution.bestScore)}</td><td>${fmt(t.search.anneal.bestScore)}</td><td>${t.compression.modeCount}</td><td>${fmt(t.compression.nmseModes,4)}</td><td>${fmt(t.compression.nmseGlobal,4)}</td><td>${fmt(t.execution.compiledScore)}</td><td>${fmt(t.execution.globalScore)}</td><td>${fmt(t.execution.compiledExact)}</td>`;
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
  renderGates(report); renderScore(report); renderModes(report); renderRoute(report); renderMandel(report);
  $('compress').disabled=false; $('execute').disabled=false;
}

async function loadReceipt(){
  try{ const r=await fetch('./results/default.json',{cache:'no-store'}); if(!r.ok) throw new Error(`HTTP ${r.status}`); render(await r.json()); }
  catch(err){ $('engineering-status').textContent=`Committed receipt unavailable: ${err.message}`; }
}

$('task-select').addEventListener('change',()=>{if(currentReport){renderModes(currentReport);renderRoute(currentReport);}});
$('compress').addEventListener('click',()=>{if(currentReport)renderModes(currentReport);});
$('execute').addEventListener('click',()=>{if(currentReport){renderRoute(currentReport);renderMandel(currentReport);}});
$('run-search').addEventListener('click',()=>{
  const btn=$('run-search'); btn.disabled=true; $('engineering-status').textContent='Running deterministic search/compression/execution…';
  setTimeout(()=>{
    try{
      const seed=Number($('seed').value)||17, budget=Math.max(24,Number($('budget').value)||4000);
      const report=runExperiment({seed,budget,instances:12,evalScale:budget>=1000?'receipt':'smoke',searchOnlySample:0});
      render(report);
    }catch(err){ $('engineering-status').textContent=`Run failed: ${err.message}`; console.error(err); }
    finally{btn.disabled=false;}
  },20);
});

loadReceipt();
