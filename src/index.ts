#!/usr/bin/env node
import { t, setLocale, present } from "./i18n";
import { Command, CommanderError } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { AutopsiaConfig, ScanResult, Violation } from './types';
import { applyBaseline, loadBaseline, printBaselineSaved, saveBaseline } from './baseline';
import { buildGraph } from './scanner';
import { runRules } from './rules/run';
import { computeHealth, printReport, writeJson, printGitHubAnnotations, writeGitHubSummary } from './reporter';
import { openInBrowser, writeHtml } from './viewer';
import { runInit } from './init';
import { computeAnalysisCoverage, validateConfig } from './analysis';
import { compareReports, loadReport, printComparison } from './compare';
import { loadTsconfig } from './tsconfig';
import { diagnose, printDoctor, resolveConfigPath } from './doctor';
import { setupCi } from './setup-ci';
import { startWatcher } from './watcher';

// Resolve presentation before building help. Commander remains responsible for parsing.
const languageArgs = process.argv.slice(2);
let requestedLanguage = 'en';
for (let i = 0; i < languageArgs.length && languageArgs[i] !== '--'; i++) {
  if (languageArgs[i] === '--lang') requestedLanguage = languageArgs[++i] ?? '';
  else if (languageArgs[i].startsWith('--lang=')) requestedLanguage = languageArgs[i].slice(7);
}
if (requestedLanguage === 'es') setLocale('es');
const program = new Command();
program
  .exitOverride()
  .configureOutput({ outputError: () => {} })
  .helpOption('-h, --help', t('cli.help'))
  .addHelpCommand('help [command]', t('cli.help'))
  .configureHelp({
    showGlobalOptions: true,
    formatHelp(command, helper) {
      const lines = [t('cli.usage') + ': ' + helper.commandUsage(command), '', command.description(), ''];
      const section = (title: string, entries: string[]) => {
        if (entries.length) lines.push(title + ':', ...entries, '');
      };
      section(t('cli.arguments'), helper.visibleArguments(command).map(a => '  ' + a.name() + '  ' + a.description));
      const options = [...helper.visibleOptions(command), ...helper.visibleGlobalOptions(command)];
      section(t('cli.options'), options.map(o => '  ' + o.flags + '  ' + o.description));
      section(t('cli.commands'), helper.visibleCommands(command).map(c => '  ' + helper.subcommandTerm(c) + '  ' + c.description()));
      return lines.join('\n');
    },
  });

program
  .name('autopsia')
  .option('--lang <language>', t('cli.lang'), 'en')
  .description(t("cli.description", {}))
  .version(require('../package.json').version, '-V, --version', t('cli.version'))
  .addHelpText(
    'after',
    t("cli.examples")
  );

export interface ScanOptions {
  config: string;
  compare?: string;
  output?: string;
  tsconfig?: string;
  html?: string | boolean;
  open?: boolean;
  ci?: boolean;
  updateBaseline?: boolean;
  baseline: boolean;
  watch?: boolean;
  format?: string;
}

export function executeScan(scanPath: string, opts: ScanOptions): { exitCode: number; result?: ScanResult } {
  const root = path.resolve(scanPath);
  let previous: ScanResult | undefined;
  if (opts.compare) {
    try {
      previous = loadReport(opts.compare);
    } catch (error) {
      console.error(chalk.red(t('cli.compareError', { p0: error instanceof Error ? error.message : String(error) })));
      return { exitCode: 2 };
    }
  }
  if (!fs.existsSync(root)) {
    console.error(chalk.red(t('cli.missingPath', { p0: root })));
    return { exitCode: 2 };
  }

  const configPath = resolveConfigPath(root, opts.config);

  if (!fs.existsSync(configPath)) {
    console.error(chalk.red(t('cli.missingConfig', { p0: root })));
    console.error(chalk.gray(t('cli.initHint', {})));
    console.error(chalk.bold(`    npx autopsia-rn init ${scanPath}`));
    console.error(chalk.bold(`    npx autopsia-rn scan ${scanPath}`));
    return { exitCode: 2 };
  }

  let config: AutopsiaConfig;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as AutopsiaConfig;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(t('cli.readError', { p0: message })));
    return { exitCode: 2 };
  }
  const configIssues = validateConfig(config);
  if (configIssues.length > 0) {
    console.error(chalk.red.bold(t('cli.invalidConfig', {})));
    for (const issue of configIssues) console.error(chalk.red(`  - ${present(issue).message}`));
    console.error('');
    return { exitCode: 2 };
  }

  if (opts.tsconfig && !fs.existsSync(path.resolve(opts.tsconfig))) {
    console.error(chalk.red(t('cli.missingTsconfig', { p0: path.resolve(opts.tsconfig) })));
    return { exitCode: 2 };
  }

  console.log(chalk.gray(t('cli.scanning', { p0: root })));
  const graph = buildGraph(root, config, opts.tsconfig);
  const analysis = computeAnalysisCoverage(graph, config, [
    ...configIssues,
    ...loadTsconfig(root, opts.tsconfig).issues,
  ]);

  const rawViolations = runRules(graph, config);

  // Comentarios autopsia-ignore: las suprimidas solo se cuentan
  const suppressedCount = rawViolations.filter((v) => v.suppressed).length;
  const allViolations = rawViolations.filter((v) => !v.suppressed);

  // Baseline: las violaciones ya registradas se toleran; solo las nuevas cuentan
  let violations = allViolations;
  let tolerated: Violation[] | undefined;
  const baseline = opts.baseline === false ? null : loadBaseline(root);
  if (baseline) {
    const split = applyBaseline(allViolations, baseline);
    violations = split.fresh;
    tolerated = split.tolerated;
  }

  const filesByLayer: Record<string, number> = {};
  for (const layer of config.layers) filesByLayer[layer.name] = 0;
  for (const node of graph) {
    if (node.layer) filesByLayer[node.layer] = (filesByLayer[node.layer] ?? 0) + 1;
  }

  const partial = {
    scannedAt: new Date().toISOString(),
    root,
    totalFiles: graph.length,
    filesByLayer,
    violations,
    tolerated,
    suppressedCount: suppressedCount > 0 ? suppressedCount : undefined,
    graph,
    analysis,
  };

  // La salud refleja TODAS las violaciones (también las toleradas)
  const result: ScanResult = {
    ...partial,
    healthByLayer: computeHealth({ ...partial, violations: allViolations }),
  };

  if (opts.format !== 'github') {
    printReport(result);
  }
  if (previous) {
    result.comparison = compareReports(previous, result);
    printComparison(result.comparison);
  }

  // Integración nativa con GitHub Actions y PRs
  if (opts.format === 'github' || (process.env.GITHUB_ACTIONS === 'true' && opts.ci)) {
    printGitHubAnnotations(violations);
    writeGitHubSummary(result);
  }

  if (opts.updateBaseline) {
    printBaselineSaved(saveBaseline(root, allViolations), allViolations.length);
  }

  if (opts.output) writeJson(result, opts.output);

  // --html sin valor (o --open solo) usa el nombre por defecto
  const htmlPath =
    typeof opts.html === 'string' ? opts.html : opts.html || opts.open ? 'autopsia-report.html' : null;
  if (htmlPath) {
    writeHtml(result, htmlPath);
    if (opts.open) openInBrowser(htmlPath);
  } else if (!opts.watch) {
    console.log(chalk.gray(t('cli.graphHint', {})));
    console.log('');
  }

  const shouldFail =
    opts.ci &&
    (violations.some((v) => v.severity === 'error') || (config.strict === true && !analysis.complete));

  return { exitCode: shouldFail ? 1 : 0, result };
}

program
  .command('scan')
  .description(t("cli.scan", {}))
  .argument('[path]', t("cli.path", {}), '.')
  .option('-c, --config <file>', t("cli.config", {}), 'autopsia.config.json')
  .option('-o, --output <file>', t("cli.output", {}))
  .option('--tsconfig <file>', t("cli.tsconfig", {}))
  .option('--html [file]', t("cli.html", {}))
  .option('--open', t("cli.open", {}))
  .option('--ci', t("cli.ci", {}))
  .option('--compare <file>', t("cli.compare", {}))
  .option('--update-baseline', t("cli.baseline", {}))
  .option('--no-baseline', t("cli.noBaseline", {}))
  .option('-w, --watch', t("cli.watch"))
  .option('--format <format>', t("cli.format"))
  .addHelpText(
    'after',
    t("cli.scanExamples")
  )
  .action((scanPath: string, opts: ScanOptions) => {
    const { exitCode } = executeScan(scanPath, opts);
    if (!opts.watch) {
      if (exitCode !== 0) process.exit(exitCode);
      return;
    }
    const root = path.resolve(scanPath);
    console.log(chalk.blue(t("watcher.start", { p0: root })));
    startWatcher({
      root,
      onChange: (changed) => {
        console.log(chalk.yellow(t("watcher.changed", { p0: changed })));
        const res = executeScan(scanPath, { ...opts, open: false, ci: false });
        if (res.result && res.result.violations.length === 0) {
          console.log(chalk.green(t("watcher.clean", {})));
        }
      },
    });
  });

program
  .command('view')
  .description(t("cli.view"))
  .argument('[path]', t("cli.path"), '.')
  .option('-c, --config <file>', t("cli.config"), 'autopsia.config.json')
  .option('-o, --output <file>', t("cli.output"))
  .option('--tsconfig <file>', t("cli.tsconfig"))
  .option('--html [file]', t("cli.html"))
  .option('-w, --watch', t("cli.watch"))
  .addHelpText('after', t("cli.viewExamples"))
  .action((viewPath: string, opts: { config: string; output?: string; tsconfig?: string; html?: string | boolean; watch?: boolean }) => {
    const scanOpts: ScanOptions = {
      config: opts.config,
      output: opts.output,
      tsconfig: opts.tsconfig,
      html: opts.html ?? true,
      open: true,
      baseline: true,
      watch: opts.watch,
    };
    const { exitCode } = executeScan(viewPath, scanOpts);
    if (!opts.watch) {
      if (exitCode !== 0) process.exit(exitCode);
      return;
    }
    const root = path.resolve(viewPath);
    console.log(chalk.blue(t("watcher.start", { p0: root })));
    startWatcher({
      root,
      onChange: (changed) => {
        console.log(chalk.yellow(t("watcher.changed", { p0: changed })));
        const res = executeScan(viewPath, { ...scanOpts, open: false, ci: false });
        if (res.result && res.result.violations.length === 0) {
          console.log(chalk.green(t("watcher.clean", {})));
        }
      },
    });
  });

program
  .command('setup-ci')
  .description(t("cli.setupCi"))
  .argument('[path]', t("cli.path"), '.')
  .option('--force', t("cli.force"))
  .option('--dry-run', t("init.dryRun"))
  .action((ciPath: string, opts: { force?: boolean; dryRun?: boolean }) => {
    const root = path.resolve(ciPath);
    process.exit(setupCi(root, { force: opts.force, dryRun: opts.dryRun }));
  });

program
  .command('init')
  .description(t("cli.init", {}))
  .argument('[path]', t("cli.initPath", {}), '.')
  .option('--force', t("cli.force", {}))
  .option('--preset <preset>', t('init.preset'))
  .option('--dry-run', t('init.dryRun'))
  .action((initPath: string, opts: { force?: boolean; preset?: string; dryRun?: boolean }) => {
    const root = path.resolve(initPath);
    if (!fs.existsSync(root)) {
      console.error(chalk.red(t("cli.missingPath", {p0: root})));
      process.exit(2);
    }
    if (opts.preset !== undefined && !['react-native', 'expo'].includes(opts.preset)) {
      console.error(t('init.invalidPreset')); process.exit(2);
    }
    process.exit(runInit(root, opts.force ?? false, { preset: opts.preset as any, dryRun: opts.dryRun }));
  });

program.command('doctor')
  .description(t('doctor.description'))
  .argument('[path]', t('cli.path'), '.')
  .option('-c, --config <file>', t('cli.config'), 'autopsia.config.json')
  .option('--tsconfig <file>', t('cli.tsconfig'))
  .option('-o, --output <file>', t('cli.output'))
  .action((doctorPath: string, opts: { config: string; tsconfig?: string; output?: string }) => {
    const report = diagnose(path.resolve(doctorPath), opts.config, opts.tsconfig);
    printDoctor(report);
    if (opts.output) fs.writeFileSync(opts.output, JSON.stringify(report, null, 2) + '\n');
    process.exit(report.status === 'ready' ? 0 : report.status === 'incomplete' ? 1 : 2);
  });

if (!['en', 'es'].includes(requestedLanguage)) {
  console.error(t('cli.invalidLang'));
  program.outputHelp();
  process.exit(2);
}
try {
  program.parse();
} catch (error) {
  if (error instanceof CommanderError) {
    if (error.exitCode === 0) process.exit(0);
    console.error(t('cli.parseError'));
    program.outputHelp();
    process.exit(error.exitCode);
  }
  console.error(t('cli.failed', { p0: error instanceof Error ? error.message : String(error) }));
  process.exit(2);
}
