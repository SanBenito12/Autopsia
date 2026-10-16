import { t } from './i18n';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';

export const GITHUB_WORKFLOW_TEMPLATE = `name: Autopsia Architecture Check

on:
  push:
    branches: [main, master, develop]
  pull_request:
    branches: [main, master, develop]

jobs:
  architecture:
    name: Clean Architecture Guard
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci || npm install

      - name: Run Autopsia Architecture Check
        run: npx autopsia-rn scan --ci --format github --html autopsia-report.html

      - name: Upload Architecture Report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: autopsia-architecture-report
          path: autopsia-report.html
`;

export interface SetupCiOptions {
  force?: boolean;
  dryRun?: boolean;
}

export function setupCi(root: string, options: SetupCiOptions = {}): number {
  const workflowsDir = path.join(root, '.github', 'workflows');
  const targetFile = path.join(workflowsDir, 'autopsia.yml');

  if (options.dryRun) {
    console.log(chalk.bold(`\n--- .github/workflows/autopsia.yml (Dry Run) ---`));
    console.log(GITHUB_WORKFLOW_TEMPLATE);
    return 0;
  }

  if (fs.existsSync(targetFile) && !options.force) {
    console.error(chalk.yellow(t('setupCi.exists', { p0: targetFile })));
    return 1;
  }

  fs.mkdirSync(workflowsDir, { recursive: true });
  fs.writeFileSync(targetFile, GITHUB_WORKFLOW_TEMPLATE, 'utf-8');

  console.log(chalk.green(t('setupCi.created', { p0: targetFile })));
  console.log(chalk.gray(t('setupCi.hint', {})));
  console.log('');

  return 0;
}
