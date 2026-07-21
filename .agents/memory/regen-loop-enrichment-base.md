---
name: Bucles regenerar-con-feedback necesitan base de enriquecimiento
description: Patron para bucles LLM generar->auditar->regenerar que pierden material o mueren en silencio.
---

Reglas para cualquier bucle generar → auditar → regenerar-con-feedback:
1. El retry debe recibir la MEJOR version previa como base de enriquecimiento explicita ("conserva integra, solo anade/profundiza"); regenerar desde cero con solo el texto del feedback produce salidas esqueleticas.
2. Guardia determinista de degeneracion: si el retry tiene MENOS material contable (personajes, subtramas...) que la mejor version, descartarlo SIN gastar la auditoria, reforzar el feedback y continuar.
3. Un veredicto negativo sin feedback accionable no debe romper el bucle en silencio: sintetizar feedback desde los problemas/resumen del propio juez; solo romper si tampoco hay problemas.

**Why:** caso real — iter 1 dio 6/10 (6 personajes/5 arcos), el retry regenero 4/0 (2/10) y el bucle murio en la iter 2 de 5 porque el veredicto "reescribir" llego sin feedback, desperdiciando el presupuesto ampliado.

**How to apply:** en cualquier bucle de calidad con presupuesto de iteraciones (WBA, auditor estructural, etc.), revisar los tres puntos antes de ampliar presupuestos: mas iteraciones no ayudan si el retry degenera o el bucle rompe temprano.

4. Rama de "fallo tecnico del juez" con salvavidas: si el juez falla y la salida nueva es valida, el salvavidas debe poder SUSTITUIR a la mejor version previa cuando no pierde material — un guard `!best` la descarta en silencio justo cuando el retry venia enriquecido (y el log puede prometer lo contrario al codigo: verificar que mensaje y rama coinciden).

5. La comparacion "mejor version" con `>` estricto pierde retries enriquecidos que EMPATAN en score: desempatar por material (unidades >= en todos los ejes y > en alguno). Y un parse fallido del retry no debe romper el bucle entero: reparar JSON antes de rendirse.
