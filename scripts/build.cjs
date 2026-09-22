const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const vendor = path.join(root, 'dist', 'vendor');
const d3 = path.resolve(path.dirname(require.resolve('d3')), '..');
fs.mkdirSync(vendor, { recursive: true });
fs.copyFileSync(path.join(d3, 'dist', 'd3.min.js'), path.join(vendor, 'd3.min.js'));
fs.copyFileSync(path.join(d3, 'LICENSE'), path.join(vendor, 'D3-LICENSE'));
fs.chmodSync(path.join(root, 'dist', 'index.js'), 0o755);
