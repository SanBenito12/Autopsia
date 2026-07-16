#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { AutopsiaConfig, ScanResult } from './types';
import { buildGraph } from './scanner';
import { checkDependencyDirection } from './rules/dependency-direction';
import { checkDirectDataAccess } from './rules/direct-data-access';
import { checkForbiddenExternal } from './rules/forbidden-external';
import { checkCircularDeps } from './rules/circular-deps';
import { computeHealth, printReport, writeJson } from './reporter';
import { writeHtml } from './viewer';
import { runInit } from './init';

const program = new Command();

program
  .name('autopsia')
  .description('Auditor de Clean Architecture para proyectos React Native / TypeScript')
  .version('0.1.0');

program
  .command('scan')
  .argument('<path>', 'Ruta del proyecto a analizar')
  .option('-c, --config <file>', 'Ruta al autopsia.config.json', 'autopsia.config.json')
  .option('-o, --output <file>', 'Guardar reporte JSON en esta ruta')
  .option('--tsconfig <file>', 'Ruta al tsconfig.json del proyecto analizado (default: tsconfig.json en la raíz escaneada)')
  .option('--html <file>', 'Generar visor HTML interactivo del grafo en esta ruta')
  .option('--ci', 'Modo CI: exit code 1 si hay violaciones de severidad error')
  .action((scanPath: string, opts: { config: string; output?: string; tsconfig?: string; html?: string; ci?: boolean }) => {
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
      console.error(chalk.red(`✖ No se encontró el config: ${configPath}`));
      console.error(chalk.gray('  Genera uno con: autopsia init <ruta>'));
      process.exit(2);
    }

    const config: AutopsiaConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    if (opts.tsconfig && !fs.existsSync(path.resolve(opts.tsconfig))) {
      console.error(chalk.red(`✖ No se encontró el tsconfig: ${path.resolve(opts.tsconfig)}`));
      process.exit(2);
    }

    console.log(chalk.gray(`\n  Escaneando ${root} ...`));
    const graph = buildGraph(root, config, opts.tsconfig);

    const violations = [
      ...checkDependencyDirection(graph, config),
      ...checkDirectDataAccess(graph, config),
      ...checkForbiddenExternal(graph, config),
      ...checkCircularDeps(graph),
    ];

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
      graph,
    };

    const result: ScanResult = { ...partial, healthByLayer: computeHealth(partial) };

    printReport(result);

    if (opts.output) writeJson(result, opts.output);

    if (opts.html) writeHtml(result, opts.html);

    if (opts.ci && violations.some((v) => v.severity === 'error')) {
      process.exit(1);
    }
  });

program
  .command('init')
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
