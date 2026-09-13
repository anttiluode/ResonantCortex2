import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runExperiment } from '../src/experiment.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const report=runExperiment({seed:17,budget:120,instances:10,evalScale:'receipt',searchOnlySample:0});

// Keep the committed/public receipt inspectable rather than dumping every learned matrix.
// Full matrices remain available in live browser runs from runExperiment().
for(const task of Object.values(report.tasks)){
  task.modes=task.modes.map(({id,threshold,trainSolvers,count})=>({id,threshold,trainSolvers,count}));
  task.interpretation.modes=(task.interpretation.modes||[]).map(({modeId,name,bestR2,probeCount,effectiveRank})=>({modeId,name,bestR2,probeCount,effectiveRank}));
  if(task.interpretation.candidates) delete task.interpretation.candidates;
  if(task.execution?.sampleRoute) task.execution.sampleRoute=task.execution.sampleRoute.slice(0,12);
  if(task.successorExecution?.sampleRoute) task.successorExecution.sampleRoute=task.successorExecution.sampleRoute.slice(0,12);
  if(task.successorGraph) task.successorGraph={alpha:task.successorGraph.alpha,edges:(task.successorGraph.edges||[]).slice(0,12)};
}
// Keep the committed receipt compact while preserving a visual Mandelbrot thumbnail.
// Scalar metrics above are computed on the full receipt evaluation grid before this reduction.
const m=report.tasks.mandelbrot.execution;
if(m?.gridSide && m.truthEscape && m.compiledEscape){
  const src=m.gridSide, dst=Math.min(8,src), pick=[];
  for(let y=0;y<dst;y++) for(let x=0;x<dst;x++){
    const sy=Math.min(src-1,Math.floor((y+.5)*src/dst));
    const sx=Math.min(src-1,Math.floor((x+.5)*src/dst));
    pick.push(sy*src+sx);
  }
  m.truthEscape=pick.map(i=>m.truthEscape[i]);
  m.compiledEscape=pick.map(i=>m.compiledEscape[i]);
  if(m.globalEscape) m.globalEscape=pick.map(i=>m.globalEscape[i]);
  const se=report.tasks.mandelbrot.successorExecution;
  if(se?.escape) se.escape=pick.map(i=>se.escape[i]);
  m.gridSide=dst;
  m.thumbnailOnly=true;
  if(se) se.thumbnailOnly=true;
}
if(report.controls?.mandelbrotImitation?.escape){
  const c=report.controls.mandelbrotImitation;
  const src=c.gridSide, dst=Math.min(8,src), pick=[];
  for(let y=0;y<dst;y++) for(let x=0;x<dst;x++){
    const sy=Math.min(src-1,Math.floor((y+.5)*src/dst));
    const sx=Math.min(src-1,Math.floor((x+.5)*src/dst));
    pick.push(sy*src+sx);
  }
  c.escape=pick.map(i=>c.escape[i]);
  c.gridSide=dst;
  c.thumbnailOnly=true;
}
// Gate 5 evidence can otherwise duplicate every probe candidate/mode summary.
if(report.gates?.gate5?.evidence?.passing){
  report.gates.gate5.evidence.passing=report.gates.gate5.evidence.passing.map(({id,modeId,name,bestR2,probeCount})=>({id,modeId,name,bestR2,probeCount}));
}
fs.mkdirSync(path.join(root,'results'),{recursive:true});
fs.writeFileSync(path.join(root,'results','default.json'),JSON.stringify(report)+'\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(report.gates).map(([k,v])=>[k,v.pass]))));
