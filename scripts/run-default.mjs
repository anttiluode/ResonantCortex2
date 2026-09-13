import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runV2V3Experiment } from '../src/v2_experiment.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const report=runV2V3Experiment({seed:17,v1Budget:120,controlBudget:400,controlInstances:10,controlEvalCount:32,evalScale:'receipt',includeV3:true});

function compactAutopsy(a){
  const hs={};
  for(const h of [1,4,8]){
    const x=a?.horizons?.[h] ?? a?.horizons?.[String(h)];
    if(x) hs[h]={fixedEndogenous:x.fixedEndogenous,freeEndogenous:x.freeEndogenous,oracleEndogenous:x.oracleEndogenous,manifoldSurvival:x.manifoldSurvival,unknownRate:x.unknownRate};
  }
  return {eligibleTransitions:a?.eligibleTransitions??0,teacherOneStepEndogenous:a?.teacherOneStepEndogenous,oracleOneStepEndogenous:a?.oracleOneStepEndogenous,dominantFailure:a?.dominantFailure,horizons:hs};
}
function pickHistoricalTask(task,id){
  const execution={compiledScore:task.execution.compiledScore,globalScore:task.execution.globalScore,compiledExact:task.execution.compiledExact,sampleRoute:[]};
  if(id==='mandelbrot') Object.assign(execution,{mandelbrotCorr:task.execution.mandelbrotCorr,mandelbrotNmae:task.execution.mandelbrotNmae,globalNmae:task.execution.globalNmae,gridSide:task.execution.gridSide,truthEscape:task.execution.truthEscape,compiledEscape:task.execution.compiledEscape});
  return {
    search:{evolution:{bestScore:task.search.evolution.bestScore},anneal:{bestScore:task.search.anneal.bestScore}},
    compression:{modeCount:task.compression.modeCount,nmseModes:task.compression.nmseModes,nmseGlobal:task.compression.nmseGlobal},
    execution,
    interpretation:{modes:(task.interpretation.modes||[]).map(({modeId,name,bestR2,effectiveRank})=>({modeId,name,bestR2,effectiveRank}))},
    autopsy:compactAutopsy(task.autopsy),
    successorGraph:{edges:[]},
    successorExecution:{score:task.successorExecution?.score,sourceOnlyScore:task.successorExecution?.sourceOnlyScore,globalScore:task.successorExecution?.globalScore,unknownRate:task.successorExecution?.unknownRate,sourceOnlyUnknownRate:task.successorExecution?.sourceOnlyUnknownRate,sampleRoute:[]},
    modes:(task.modes||[]).map(({id,threshold,count})=>({id,threshold,count}))
  };
}

// Keep an 8x8 historical Mandelbrot thumbnail for the Pages viewer.
const fullM=report.tasks.mandelbrot.execution;
if(fullM?.gridSide&&fullM.truthEscape&&fullM.compiledEscape){
  const src=fullM.gridSide,dst=Math.min(8,src),pick=[];
  for(let y=0;y<dst;y++) for(let x=0;x<dst;x++){
    const sy=Math.min(src-1,Math.floor((y+.5)*src/dst));
    const sx=Math.min(src-1,Math.floor((x+.5)*src/dst));
    pick.push(sy*src+sx);
  }
  fullM.truthEscape=pick.map(i=>fullM.truthEscape[i]);
  fullM.compiledEscape=pick.map(i=>fullM.compiledEscape[i]);
  fullM.gridSide=dst;
}

report.tasks=Object.fromEntries(Object.entries(report.tasks).map(([id,t])=>[id,pickHistoricalTask(t,id)]));

// Keep only the historical control scalars needed by the UI.
if(report.controls?.mandelbrotImitation){
  const c=report.controls.mandelbrotImitation;
  report.controls={mandelbrotImitation:{evidenceType:c.evidenceType,label:c.label,correlation:c.correlation,normalizedMae:c.normalizedMae}};
}

// Compact V2 to measured scalar evidence plus a short representative route.
for(const [id,task] of Object.entries(report.causalControl?.tasks||{})){
  report.causalControl.tasks[id]={
    search:{score:task.search.score,exact:task.search.exact,noControlScore:task.search.noControlScore,evolutionHasSuccess:task.search.evolutionHasSuccess,annealHasSuccess:task.search.annealHasSuccess},
    compiled:{score:task.compiled.score,exact:task.compiled.exact,globalScore:task.compiled.globalScore,globalExact:task.compiled.globalExact,nearestScore:task.compiled.nearestScore,zeroScore:task.compiled.zeroScore,searchEvaluationsAtInference:task.compiled.searchEvaluationsAtInference,unknownRate:task.compiled.unknownRate,motifCount:task.compiled.motifCount,usedMotifs:task.compiled.usedMotifs},
    horizon:task.horizon
  };
}

// Compact V3 probes to exactly the closure evidence used by Gates 12/13 and the UI.
if(report.globalConsistency?.episodes){
  report.globalConsistency.episodes=report.globalConsistency.episodes.map(e=>({
    name:e.name,localLegal:e.localLegal,allConverged:e.allConverged,boundsOk:e.boundsOk,finite:e.finite,
    readoutClosure:e.readoutClosure,invariantClosure:e.invariantClosure,closureError:e.closureError,
    maxApplicabilityResidual:e.maxApplicabilityResidual,maxNewtonResidual:e.maxNewtonResidual
  }));
}

if(report.gates?.gate5?.evidence?.passing){
  report.gates.gate5.evidence.passing=report.gates.gate5.evidence.passing.map(({id,modeId,name,bestR2,probeCount})=>({id,modeId,name,bestR2,probeCount}));
}

fs.mkdirSync(path.join(root,'results'),{recursive:true});
fs.writeFileSync(path.join(root,'results','default.json'),JSON.stringify(report)+'\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(report.gates).map(([k,v])=>[k,v.pass]))));
