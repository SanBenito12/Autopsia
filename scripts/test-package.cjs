const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'autopsia-package-'));
function npm(args, cwd) {
  const cli = process.env.npm_execpath;
  assert.ok(cli, 'Run using npm run test:package');
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}
try {
  const packed = JSON.parse(npm(['pack', '--ignore-scripts', '--json', '--pack-destination', temp], root))[0];
  npm(['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline', '--prefix', temp, path.join(temp, packed.filename)], temp);
  const installed = path.join(temp, 'node_modules', 'autopsia-rn');
  const cli = path.join(installed, 'dist', 'index.js');
  const run = (args) => spawnSync(process.execPath, [cli, ...args], { cwd: temp, encoding: 'utf8' });
  assert.equal(run(['--version']).stdout.trim(), require('../package.json').version);
  const report = path.join(temp, 'report.html');
  const result = run(['scan', path.join(root, 'fixtures', 'sample-app'), '--ci', '--html', report]);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /Total: 5 violaciones/);
  const html = fs.readFileSync(report, 'utf8');
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.match(html, /Permission to use, copy, modify/);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert.equal(scripts.length, 2);
  const context = {};
  vm.runInNewContext(scripts[0], context);
  assert.equal(typeof context.d3.forceSimulation, 'function');
  new vm.Script(scripts[1]);
  assert.ok(fs.existsSync(path.join(installed, 'dist', 'vendor', 'D3-LICENSE')));
  console.log('Installed package: version, CI failure, and offline HTML verified.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
