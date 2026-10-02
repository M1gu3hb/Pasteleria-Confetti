import fs from 'node:fs';import ts from 'typescript';import assert from 'node:assert/strict';
const configFile=ts.readConfigFile('jsconfig.json',ts.sys.readFile);if(configFile.error)throw Error(ts.flattenDiagnosticMessageText(configFile.error.messageText,'\n'));
const parsed=ts.parseJsonConfigFileContent(configFile.config,ts.sys,'.');
const program=ts.createProgram(parsed.fileNames,{...parsed.options,noEmit:true});
const diagnostics=ts.getPreEmitDiagnostics(program).filter(d=>d.category===ts.DiagnosticCategory.Error);
const fingerprint=d=>{const path=d.file?d.file.fileName.replace(process.cwd()+'/',''):'';const line=d.file&&d.start!==undefined?d.file.getLineAndCharacterOfPosition(d.start).line:null;const anchor=line===null?'':d.file.text.split(/\r?\n/)[line].trim();return JSON.stringify([path,d.code,ts.flattenDiagnosticMessageText(d.messageText,'\n'),anchor]);};
const counts=new Map();for(const d of diagnostics){const k=fingerprint(d);counts.set(k,(counts.get(k)||0)+1);}
const file=new URL('./fixtures/typecheck_deuda_conocida.json',import.meta.url);
if(process.argv.includes('--write-baseline')){fs.mkdirSync(new URL('./fixtures/',import.meta.url),{recursive:true});fs.writeFileSync(file,JSON.stringify({fecha:'2026-10-02',descripcion:'Deuda preexistente, contrastada con la versión publicada. No exime diagnósticos nuevos. Cualquier aumento requiere revisión explícita.',diagnosticos:Object.fromEntries([...counts].sort())},null,2)+'\n');console.log('Recorded known debt:',diagnostics.length);}
else {const known=JSON.parse(fs.readFileSync(file,'utf8')).diagnosticos;const fresh=[...counts].filter(([k,n])=>n>(known[k]||0));for(const [k,n]of fresh)console.error('NEW TYPE ERROR',k,'count',n);assert.equal(fresh.length,0,'New type errors cannot be published');console.log(`PASS: no new TypeScript diagnostics; ${diagnostics.length} known errors remain (raw npm run typecheck still fails until debt is fixed)`);}
