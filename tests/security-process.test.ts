import test from 'node:test';
import assert from 'node:assert/strict';
import { runProgram } from '../src/security/process.js';

test('processo recebe argumentos literais sem expansão de shell ou segredos herdados', async () => {
  process.env.GEMINI_API_KEY = 'segredo-falso-do-teste';
  const result = await runProgram('printf', ['%s', '$(id); `id`'], { cwd: process.cwd(), timeoutMs: 2000 });
  assert.equal(result.ok, true);
  assert.equal(result.stdout, '$(id); `id`');
  assert.equal(result.exitCode, 0);
  const environment = await runProgram('printenv', ['GEMINI_API_KEY'], { cwd: process.cwd(), timeoutMs: 2000 });
  assert.equal(environment.stdout, '');
  assert.equal(environment.exitCode, 1);
});

test('processo exige timeout e encerra programa que ultrapassa o limite', async () => {
  await assert.rejects(runProgram(process.execPath, [], { cwd: process.cwd(), timeoutMs: 0 }), /timeout/i);
  const result = await runProgram('sleep', ['10'], { cwd: process.cwd(), timeoutMs: 50 });
  assert.equal(result.ok, false);
});
