import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';

// UI-only release: no migrations, inference calls, session creation or maintenance toggle.
const config='dist/server/wrangler.json';
const built=JSON.parse(await readFile(config,'utf8'));
assert.equal(built.name,'cmine-fit');
assert.equal(built.vars.PUBLIC_ORIGIN,'https://fit.chwjh.com');
assert.equal(built.d1_databases[0].database_id,'eb042b40-024b-42c1-9224-6b067d77dfd5');
assert.ok(built.assets?.directory);
const commit=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim();
assert.match(commit,/^[a-f0-9]{40}$/);
const directory=`.wrangler/releases/ui-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(directory,{recursive:true});
const save=()=>writeFile(path.join(directory,'release.json'),JSON.stringify(report,null,2));
async function run(label,args){
  const result=await new Promise((resolve,reject)=>{
    const p=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args],{env:{...process.env,CI:'true'},stdio:['ignore','pipe','pipe']});
    let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject);p.on('close',code=>resolve({code,out,err}));
  });
  await writeFile(path.join(directory,label+'.log'),result.out+result.err);
  assert.equal(result.code,0,`${label} failed; see ignored release log`);
  return result.out;
}
async function latest(){const rows=JSON.parse(await run('deployments',['deployments','list','--config',config,'--json']));return rows.sort((a,b)=>a.created_on.localeCompare(b.created_on)).at(-1);}
async function health(){const r=await fetch(built.vars.PUBLIC_ORIGIN+'/api/health?uiRelease='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);return r.json();}
const baseline=await latest();assert.equal(baseline.versions.length,1);assert.equal(baseline.versions[0].percentage,100);
const before=await health();assert.ok(before.ok&&before.schemaReady&&before.coachChat&&before.cmine);
const report={worker:built.name,origin:built.vars.PUBLIC_ORIGIN,commit,preparedAt:new Date().toISOString(),baseline,before,noDatabaseChanges:true,preserveVariablesAndSecrets:true};await save();
const output=await run('upload',['versions','upload','--config',config,'--keep-vars','--tag',`ui-${commit.slice(0,8)}`,'--message','Everyday Strength interface, Lucide icons and aligned controls']);
report.version=output.match(/Worker Version ID: ([\da-f-]{36})/)?.[1];assert.ok(report.version);await save();
assert.equal((await latest()).id,baseline.id,'Production changed during preparation; keep the uploaded version inactive');
await run('publish',['versions','deploy',report.version+'@100','--yes','--config',config,'--message','Cmine Fit UI refresh; preserve AI, authentication and records']);
try {
  let after;
  for(let i=0;i<6;i++){
    after=await health();if(after.ok&&after.schemaReady&&after.coachChat&&after.cmine)break;
    await new Promise(r=>setTimeout(r,1200));
  }
  for(const key of Object.keys(before))if(typeof before[key]==='boolean')assert.equal(after[key],before[key],`Capability changed: ${key}`);
  const live=await latest();assert.equal(live.versions[0].version_id,report.version);
  report.after=after;report.deployment=live.id;report.releasedAt=new Date().toISOString();await save();
  console.log(JSON.stringify({released:true,directory,version:report.version,rollback:baseline.versions[0].version_id,commit,health:after}));
}catch(error){
  const live=await latest();
  if(live.versions.length===1&&live.versions[0].version_id===report.version){await run('rollback',['versions','deploy',baseline.versions[0].version_id+'@100','--yes','--config',config,'--message','Restore previous full version after UI health check']);report.rolledBackAt=new Date().toISOString();await save();}
  throw error;
}
