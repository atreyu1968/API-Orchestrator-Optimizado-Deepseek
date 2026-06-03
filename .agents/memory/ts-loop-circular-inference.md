---
name: TS circular-inference cascade en bucles (TS7022)
description: Por qué un const al inicio de un bucle que depende de un let mutado al final dispara TS7022 en cadena, y cómo cortarlo.
---

## Síntoma

`tsc --noEmit` reporta `TS7022: 'X' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer`, y al anotar `X` el error SALTA al siguiente `const` del mismo bloque, en cascada hacia abajo.

## Causa

Existe un ciclo de inferencia: un `const` cerca del INICIO del cuerpo del bucle (p. ej. `readerOpts`) se construye leyendo un `let` que se REASIGNA cerca del FINAL del mismo cuerpo, y esa reasignación usa valores derivados del propio `const`. TypeScript no puede romper el ciclo por inferencia y "envenena" a `any` toda la cadena de consts intermedios; bajo `noImplicitAny` cada uno se reporta en orden.

**Why:** el control-flow de un `let` a través de iteraciones obliga a TS a unir los tipos de todas sus asignaciones para tipar la lectura del inicio; si una asignación depende (transitivamente, vía llamadas cuyo retorno se infiere o vía otros consts) del valor que se está tipando, el grafo se vuelve circular.

## Cómo cortarlo

Añadir anotaciones de tipo EXPLÍCITAS a los nodos de la cadena hasta romper el ciclo: típicamente el `const` inicial (p. ej. `const readerOpts: { regressionWarning: string } | undefined = ...`), el resultado destructurado de `Promise.allSettled` con su tupla (`const [a, b]: [PromiseSettledResult<A>, PromiseSettledResult<B>] = ...`) y los `const` de string/score derivados (`const notes: string = ...`). El `let` mutado debe llevar ya su anotación (`let x: string | null = null;`).

**How to apply:** ante un TS7022 en cascada dentro de un bucle, no anotes a ciegas uno por uno esperando que pare; identifica el ciclo (const-inicio ↔ let-mutado-al-final) y anota explícitamente los consts implicados. Dar tipo de retorno explícito a las funciones llamadas dentro del ciclo también ayuda.
