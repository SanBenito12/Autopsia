import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setupCi, GITHUB_WORKFLOW_TEMPLATE } from '../src/setup-ci';

describe('setup-ci command', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'autopsia-ci-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('crea .github/workflows/autopsia.yml con el workflow correcto', () => {
    const exitCode = setupCi(tmpRoot);
    expect(exitCode).toBe(0);

    const workflowPath = path.join(tmpRoot, '.github', 'workflows', 'autopsia.yml');
    expect(fs.existsSync(workflowPath)).toBe(true);

    const content = fs.readFileSync(workflowPath, 'utf-8');
    expect(content).toBe(GITHUB_WORKFLOW_TEMPLATE);
    expect(content).toContain('--format github');
    expect(content).toContain('upload-artifact');
  });

  it('soporta --dry-run sin crear archivos', () => {
    const exitCode = setupCi(tmpRoot, { dryRun: true });
    expect(exitCode).toBe(0);

    const workflowPath = path.join(tmpRoot, '.github', 'workflows', 'autopsia.yml');
    expect(fs.existsSync(workflowPath)).toBe(false);
  });

  it('rechaza sobrescribir un workflow existente sin --force', () => {
    const workflowPath = path.join(tmpRoot, '.github', 'workflows', 'autopsia.yml');
    fs.mkdirSync(path.dirname(workflowPath), { recursive: true });
    fs.writeFileSync(workflowPath, '# existing workflow', 'utf-8');

    const exitCode = setupCi(tmpRoot, { force: false });
    expect(exitCode).toBe(1);
    expect(fs.readFileSync(workflowPath, 'utf-8')).toBe('# existing workflow');
  });

  it('sobrescribe el workflow si se pasa --force', () => {
    const workflowPath = path.join(tmpRoot, '.github', 'workflows', 'autopsia.yml');
    fs.mkdirSync(path.dirname(workflowPath), { recursive: true });
    fs.writeFileSync(workflowPath, '# existing workflow', 'utf-8');

    const exitCode = setupCi(tmpRoot, { force: true });
    expect(exitCode).toBe(0);
    expect(fs.readFileSync(workflowPath, 'utf-8')).toBe(GITHUB_WORKFLOW_TEMPLATE);
  });
});
