---
name: repairJson devuelve objeto, no string
description: Contrato de retorno de repairJson() y el footgun del doble JSON.parse que rompió 5 agentes.
---

# `repairJson()` ya devuelve el objeto parseado — NUNCA lo envuelvas en `JSON.parse`

`server/utils/json-repair.ts` exporta `repairJson(raw): any`. TODAS sus estrategias
internas terminan en `JSON.parse(...)` (o `smartTruncationSalvage`/`manualRepair`, que
también parsean), así que **siempre devuelve un objeto/array ya parseado, jamás un string**.

**Footgun:** llamar `const r = repairJson(content); JSON.parse(r)` coacciona el objeto a la
cadena literal `"[object Object]"` y `JSON.parse` lanza `"[object Object]" is not valid JSON`.
El mensaje de error parece "truncamiento o JSON malformado" pero NO lo es: falla el 100% de
las veces, independientemente del contenido.

**Patrón correcto:** `const parsed = repairJson(content) as MiTipo;` y luego validar campos.

**Why:** este doble parseo dejó 5 agentes (world-bible-auditor, originality-critic,
plot-integrity-auditor, outline-beta-reader, series-world-bible-consolidator) cayendo SIEMPRE
a su fallback `null`. El Auditor de World Bible, sin resultado, reutilizaba la Fase 1 sin
auditar (de ahí que una base con "0 arcos" pasara sin que `densidad_arcos` la bloqueara).

**How to apply:** al añadir un caller de `repairJson`, usar su retorno directo. Si ves
`JSON.parse(repaired)` donde `repaired = repairJson(...)`, es bug. Salvaguarda relacionada:
el salvavidas del bucle WBA (`phase1LookValid` en `orchestrator.ts`) exige densidad mínima de
subtramas (N>30→4, N<20→2, resto→3), no solo `personajes>0`, para no congelar una Fase 1 floja
cuando el auditor falle por causas reales (timeout/truncamiento).
