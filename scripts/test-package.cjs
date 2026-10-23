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
  // npm <= 11 prints an array; npm 12 prints an object keyed by package name.
  const packOutput = JSON.parse(npm(['pack', '--ignore-scripts', '--json', '--pack-destination', temp], root));
  const packed = Array.isArray(packOutput) ? packOutput[0] : Object.values(packOutput)[0];
  npm(['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline', '--prefix', temp, path.join(temp, packed.filename)], temp);
  const installed = path.join(temp, 'node_modules', 'autopsia-rn');
  const cli = path.join(installed, 'dist', 'index.js');
  const run = (args) => spawnSync(process.execPath, [cli, ...args], { cwd: temp, encoding: 'utf8' });
  assert.equal(run(['--version']).stdout.trim(), require('../package.json').version);
  const app = path.join(temp, 'app');
  fs.mkdirSync(app); fs.writeFileSync(path.join(app, 'App.tsx'), 'export const App = 1;');
  for (const language of ['en', 'es']) {
    assert.equal(run(['init', app, '--preset', 'react-native', '--dry-run', '--lang', language]).status, 0);
    assert.equal(fs.existsSync(path.join(app, 'autopsia.config.json')), false);
  }
  assert.equal(run(['init', app, '--preset', 'react-native']).status, 0);
  for (const language of ['en', 'es']) {
    const result = run(['doctor', app, '--lang', language]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, language === 'en' ? /Ready:/ : /Listo:/);
  }
  const report = path.join(temp, 'report.html');
  const result = run(['scan', path.join(root, 'fixtures', 'sample-app'), '--ci', '--html', report]);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /Total: 5 violations/);
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
