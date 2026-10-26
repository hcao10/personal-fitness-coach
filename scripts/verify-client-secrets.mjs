import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {homedir} from 'node:os';
const secrets=[];
try{for(const line of (await readFile('.dev.vars','utf8')).split(/\r?\n/)){const match=line.match(/^([A-Z_]*(?:KEY|SECRET|TOKEN))\s*=\s*(.*)$/);if(match){const value=match[2].trim().replace(/^["']|["']$/g,'');if(value.length>12)secrets.push(value);}}}catch{}
try{secrets.push((await readFile(path.join(homedir(),'.config/anybite/model-hub-admin.key'),'utf8')).trim());}catch{}
async function files(directory){const result=[];for(const entry of await readdir(directory,{withFileTypes:true})){const filename=path.join(directory,entry.name);result.push(...(entry.isDirectory()?await files(filename):[filename]));}return result;}
const assets=await files('dist/client');let matches=0;for(const file of assets){const bytes=await readFile(file);for(const secret of secrets)if(secret && bytes.includes(Buffer.from(secret)))matches++;}
assert.equal(matches,0,'A credential is present in the client output; block release');console.log(JSON.stringify({clientArtifacts:assets.length,credentialMatches:matches}));
