// Executa arquivos sequencialmente, sem o canal IPC instável do runner --test.
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const files=fs.readdirSync(path.join(root,'tests')).filter(name=>name.endsWith('.test.ts')).sort();
let failed=0,total=0,passed=0;
for(const file of files){
  const result=spawnSync(process.execPath,['--require',path.join(root,'tests/no-secrets.cjs'),'--import','tsx',path.join(root,'tests',file)],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024,timeout:120_000,env:{...process.env,NODE_OPTIONS:'--max-old-space-size=256'}});
  const output=result.stdout||'';process.stdout.write(output);if(result.stderr)process.stderr.write(result.stderr);
  const count=output.match(/(?:# |ℹ )tests\s+(\d+)/),ok=output.match(/(?:# |ℹ )pass\s+(\d+)/);
  total+=Number(count?.[1]||0);passed+=Number(ok?.[1]||0);
  if(result.status!==0||result.error){failed++;console.error(`Falha no arquivo ${file}: ${result.error?.message||`saída ${result.status}`}`);}
}
console.log(`Verificação final: ${passed}/${total} testes passaram; ${files.length} arquivos; ${failed} arquivos com falha.`);
process.exitCode=failed?1:0;
