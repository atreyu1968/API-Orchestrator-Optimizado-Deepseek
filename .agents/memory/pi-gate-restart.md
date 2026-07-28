---
name: Bucle de Integridad Narrativa con Cirujano y Gate
description: Fix_PI_SURGEON + Fix_PI_RESTART + Fix_PI_GATE en el bucle del Auditor de Integridad Narrativa
---

## Regla
El bucle del Auditor de Integridad Narrativa tiene tres niveles de respuesta:

1. **Fix_PI_SURGEON** — primer retry: Cirujano quirúrgico sobre caps citados en problemas (mismo patrón Fix267/Fix271). Fallback a Arquitecto completo si falla.
2. **Fix_PI_RESTART** — si al agotar las iters la trayectoria es plana/regresiva Y quedan altas → reiniciar escaleta desde cero (manteniendo WB, max 2 reinicios).
3. **Fix_PI_GATE** — si tras todos los reinicios persisten altas bajo 7/10 → `status: "failed"`, return, mensaje explícito.

**Why:** Un outline con problemas altos de integridad (clímax sin siembra, antagonista pasivo, colapso post-clímax) produce un libro "nacido muerto" que no converge en post-finalización. El sistema no debe escribir 30 capítulos sobre esa base.

**How to apply:** La lógica está en el bloque [Fix18] del orchestrator.ts, sección PI. El gate solo dispara si `bestPlotIntegrity.problemsSummary.includes("[alta]")` — así no bloquea runs donde el score quedó bajo pero sin altas reales.
