import assert from 'node:assert';
import test from 'node:test';
import { CtxOptSession, utils, version } from '../index.js';

test('version() returns a string', () => {
  const v = version();
  assert.ok(typeof v === 'string');
  assert.match(v, /^\d+\.\d+\.\d+/);
});

test('utils.estimateTokens() works', () => {
  const tokens = utils.estimateTokens('Hello, world!');
  assert.ok(typeof tokens === 'number');
  assert.ok(tokens > 0 && tokens < 100);
});

test('utils.isCodeFile() detects code files', () => {
  assert.ok(utils.isCodeFile('src/main.ts'));
  assert.ok(utils.isCodeFile('app.py'));
  assert.ok(utils.isCodeFile('lib.rs'));
  assert.ok(!utils.isCodeFile('README.md'));
  assert.ok(!utils.isCodeFile('config.json'));
});

test('utils.stripAnsi() removes ANSI codes', () => {
  const clean = utils.stripAnsi('\x1b[31mError\x1b[0m');
  assert.strictEqual(clean, 'Error');
});

test('CtxOptSession can be created', () => {
  // Note: Ce test necessite que 'echo' soit disponible
  const session = new CtxOptSession(24, 80, 'echo');
  assert.ok(session);
});

test('CtxOptSession.read() returns ReadResult', async () => {
  const session = new CtxOptSession(24, 80, 'echo');

  // Attendre un peu
  await new Promise(resolve => setTimeout(resolve, 100));

  const result = await session.read();
  assert.ok('output' in result);
  assert.ok('suggestions' in result);
  assert.ok('tokenEstimate' in result);
  assert.ok(Array.isArray(result.suggestions));
});

test('CtxOptSession.stats() returns SessionStats', async () => {
  const session = new CtxOptSession(24, 80, 'echo');

  const stats = await session.stats();
  assert.ok('totalTokens' in stats);
  assert.ok('totalSuggestions' in stats);
  assert.ok('elapsedMs' in stats);
  assert.ok(typeof stats.totalTokens === 'number');
});

test('CtxOptSession.isRunning() works', async () => {
  const session = new CtxOptSession(24, 80, 'sleep');

  // sleep sans args termine immediatement (erreur)
  await new Promise(resolve => setTimeout(resolve, 100));

  const running = await session.isRunning();
  assert.ok(typeof running === 'boolean');
});

test('CtxOptSession.withConfig() factory works', () => {
  const session = CtxOptSession.withConfig(30, 100, 'echo', 3000, false);
  assert.ok(session);
});
