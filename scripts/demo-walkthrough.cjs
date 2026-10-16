// Reproducible public-fixture demo. Original fixtures are never modified.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const { generateHtml } = require('../dist/viewer');
const { setLocale } = require('../dist/i18n');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'autopsia-demo-'));
function scan(args) {
  const run = spawnSync(process.execPath, [path.join(root, 'dist/index.js'), 'scan', temp, ...args], {
    encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '0' },
  });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout.split(temp).join('fixtures/sample-app');
}
try {
  fs.cpSync(path.join(root, 'fixtures/sample-app'), temp, { recursive: true });
  const diagnostic = spawnSync(process.execPath, [path.join(root, 'dist/index.js'), 'doctor', temp], { encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '0' } });
  assert.equal(diagnostic.status, 0, diagnostic.stderr);
  fs.writeFileSync(path.join(root, 'docs/demo-doctor.txt'), diagnostic.stdout.split(temp).join('fixtures/sample-app'));
  const before = path.join(temp, 'before.json');
  const output = scan(['-o', before]);
  const report = JSON.parse(fs.readFileSync(before, 'utf8'));
  assert.equal(report.violations.length, 5);
  report.root = 'fixtures/sample-app';
  fs.writeFileSync(path.join(root, 'docs/report.html'), generateHtml(report));
  setLocale('es');
  fs.writeFileSync(path.join(root, 'docs/report.es.html'), generateHtml(report));
  fs.writeFileSync(path.join(root, 'docs/demo-output.txt'), output);
  const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const transcript = '$ autopsia --version\n' + require('../package.json').version + '\n\n$ autopsia doctor fixtures/sample-app\n' + diagnostic.stdout.split(temp).join('fixtures/sample-app') + '\n$ autopsia scan fixtures/sample-app\n[excerpt — full output linked below]\n' + output.split('\n').slice(0, 18).join('\n') + '\n  …\n' + output.split('\n').find(line => line.includes('Total:'));
  fs.writeFileSync(path.join(root, 'docs/cli-preview.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Autopsia CLI — public fixture</title><style>body{margin:0;padding:28px;background:#101211;color:#e5f1de}pre{font:14px/1.5 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere}a{color:#b9f586}</style><a href="index.html">Autopsia · public fixture · local 0.6 preview</a><pre>' + escape(transcript) + '</pre><a href="demo-output.txt">Full scan transcript</a> · <a href="demo-doctor.txt">Full doctor transcript</a></html>');

  // The fixture's circular helpers have no real business behavior: make B independent.
  fs.writeFileSync(path.join(temp, 'src/presentation/screens/helperB.ts'), 'export const b = () => 1;\n');
  const after = path.join(temp, 'after.json');
  const comparison = scan(['--compare', before, '-o', after]);
  const result = JSON.parse(fs.readFileSync(after, 'utf8'));
  assert.equal(result.violations.length, 4);
  assert.equal(result.comparison.resolved.length, 1);
  assert.equal(result.comparison.added.length, 0);
  fs.writeFileSync(path.join(root, 'docs/demo-after.txt'), comparison);
  console.log('Verified public fixture: 5 → 4 violations; 1 resolved, 0 new.');
  console.log('Generated docs/report.html, docs/report.es.html and terminal transcripts.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
