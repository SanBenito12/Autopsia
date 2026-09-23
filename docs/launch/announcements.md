# Announcement drafts — do not post automatically

## English

How do you introduce architecture checks when your React Native app already has debt?

Autopsia 0.5 lets you record current violations as a baseline, then fail CI on new errors. Strict analysis also tells you when files or dependencies were left unchecked. An offline graph helps explain the findings.

The CLI and reports now support English and Spanish. In the public eight-file example, removing one circular dependency takes the report from five violations to four, with zero new findings.

Try: `npx autopsia-rn@0.5.0 init`, review the config, then `npx autopsia-rn@0.5.0 scan . --html --open`.

Demo: https://sanbenito12.github.io/Autopsia/
Code and limitations: https://github.com/SanBenito12/Autopsia

I'm looking for five React Native projects to try it. What was difficult to configure, and which findings would you dispute?

## Español

¿Cómo introduces verificaciones arquitectónicas si tu app React Native ya tiene deuda?

Autopsia 0.5 registra las violaciones actuales como baseline y hace fallar CI con errores nuevos. El análisis estricto también avisa cuando quedaron archivos o dependencias sin comprobar. Un grafo sin conexión ayuda a explicar los hallazgos.

La CLI y los reportes ahora tienen inglés y español. En el ejemplo público de ocho archivos, romper un ciclo reduce cinco violaciones a cuatro, sin hallazgos nuevos.

Prueba `npx autopsia-rn@0.5.0 init --lang es`, revisa la configuración y ejecuta `npx autopsia-rn@0.5.0 scan . --html --open --lang es`.

Demo: https://sanbenito12.github.io/Autopsia/index.es.html
Código y límites: https://github.com/SanBenito12/Autopsia

Busco cinco proyectos React Native que lo prueben. ¿Qué costó configurar y con qué hallazgos no estás de acuerdo?

## Follow-up measurements

Record project consent, time to first useful report, configuration changes, disputed findings, CI adoption, and whether it is still enabled after four weeks. Target: five external trials and three retained CI installations. These are goals, not existing users or guaranteed results. Publish only consented project details. npm downloads are a secondary signal and are not unique-user counts.
