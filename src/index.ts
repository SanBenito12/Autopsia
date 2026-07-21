#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { AutopsiaConfig, ScanResult, Violation } from './types';
import { applyBaseline, loadBaseline, printBaselineSaved, saveBaseline } from './baseline';
import { buildGraph } from './scanner';
import { runRules } from './rules/run';
import { computeHealth, printReport, writeJson } from './reporter';
import { openInBrowser, writeHtml } from './viewer';
import { runInit } from './init';
import { computeAnalysisCoverage, validateConfig } from './analysis';

const program = new Command();

program
  .name('autopsia')
  .description('Auditor de Clean Architecture para proyectos React Native / TypeScript')
  .version('0.3.1')
  .addHelpText(
    'after',
    `
Ejemplos:
  $ autopsia init                     genera autopsia.config.json detectando tus capas
  $ autopsia scan .                   audita el proyecto actual
  $ autopsia scan . --html --open     abre el grafo interactivo en el navegador
  $ autopsia scan . --update-baseline tolera las violaciones actuales (proyectos legacy)

Guía completa: https://github.com/SanBenito12/Autopsia#readme`
  );

program
  .command('scan')
  .description('Audita el proyecto contra las reglas de Clean Architecture de tu config')
  .argument('[path]', 'Ruta del proyecto a analizar', '.')
  .option('-c, --config <file>', 'Ruta al autopsia.config.json', 'autopsia.config.json')
  .option('-o, --output <file>', 'Guardar reporte JSON en esta ruta')
  .option('--tsconfig <file>', 'Ruta al tsconfig.json del proyecto analizado (default: tsconfig.json en la raíz escaneada)')
  .option('--html [file]', 'Generar visor HTML interactivo del grafo (default: autopsia-report.html)')
  .option('--open', 'Abrir el visor HTML en el navegador al terminar (implica --html)')
  .option('--ci', 'Modo CI: exit code 1 si hay violaciones de severidad error')
  .option('--update-baseline', 'Guardar las violaciones actuales en autopsia-baseline.json como toleradas')
  .option('--no-baseline', 'Ignorar el baseline existente en este scan')
  .addHelpText(
    'after',
    `
Ejemplos:
  $ autopsia scan                       audita el directorio actual (path default: ".")
  $ autopsia scan . --html --open       genera y abre el grafo interactivo
  $ autopsia scan . --update-baseline   tolera las violaciones actuales; solo fallará lo nuevo
  $ autopsia scan . --ci                exit code 1 si hay violaciones (nuevas) de severidad error`
  )
  .action((scanPath: string, opts: { config: string; output?: string; tsconfig?: string; html?: string | boolean; open?: boolean; ci?: boolean; updateBaseline?: boolean; baseline: boolean }) => {
    const root = path.resolve(scanPath);
    if (!fs.existsSync(root)) {
      console.error(chalk.red(`✖ La ruta no existe: ${root}`));
      process.exit(2);
    }

    const configPath = path.isAbsolute(opts.config)
      ? opts.config
      : fs.existsSync(path.join(root, opts.config))
        ? path.join(root, opts.config)
        : path.resolve(opts.config);

    if (!fs.existsSync(configPath)) {
      console.error(chalk.red(`✖ No se encontró autopsia.config.json en ${root}`));
      console.error(chalk.gray('  Genera uno (detecta tus capas automáticamente) y vuelve a escanear:'));
      console.error(chalk.bold(`    npx autopsia-rn init ${scanPath}`));
      console.error(chalk.bold(`    npx autopsia-rn scan ${scanPath}`));
      process.exit(2);
    }

    let config: AutopsiaConfig;
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as AutopsiaConfig;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`✖ No se pudo leer el config: ${message}`));
      process.exit(2);
    }
    const configIssues = validateConfig(config);
    if (configIssues.length > 0) {
      console.error(chalk.red.bold('\n  ✖ Configuración inválida'));
      for (const issue of configIssues) console.error(chalk.red(`  - ${issue.message}`));
      console.error('');
      process.exit(2);
    }

    if (opts.tsconfig && !fs.existsSync(path.resolve(opts.tsconfig))) {
      console.error(chalk.red(`✖ No se encontró el tsconfig: ${path.resolve(opts.tsconfig)}`));
      process.exit(2);
    }

    console.log(chalk.gray(`\n  Escaneando ${root} ...`));
    const graph = buildGraph(root, config, opts.tsconfig);
    const analysis = computeAnalysisCoverage(graph, config, configIssues);

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

    // La salud refleja TODAS las violaciones (también las toleradas):
    // el baseline perdona el --ci, no maquilla la arquitectura.
    const result: ScanResult = {
      ...partial,
      healthByLayer: computeHealth({ ...partial, violations: allViolations }),
    };

    printReport(result);

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
    } else {
      console.log(chalk.gray('  Tip: agrega --html --open para ver el grafo interactivo'));
      console.log('');
    }

    if (
      opts.ci &&
      (violations.some((v) => v.severity === 'error') || (config.strict === true && !analysis.complete))
    ) {
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Genera autopsia.config.json detectando las capas de tu proyecto bajo src/')
  .argument('[path]', 'Ruta del proyecto donde generar el config', '.')
  .option('--force', 'Sobrescribir autopsia.config.json si ya existe')
  .action((initPath: string, opts: { force?: boolean }) => {
    const root = path.resolve(initPath);
    if (!fs.existsSync(root)) {
      console.error(chalk.red(`✖ La ruta no existe: ${root}`));
      process.exit(2);
    }
    process.exit(runInit(root, opts.force ?? false));
  });

program.parse();
