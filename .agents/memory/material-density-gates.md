---
name: Puertas de densidad de material narrativo
description: Un aviso "al limite" de un juez LLM no es apto; las puertas de calidad necesitan enforcement determinista y los deficits deben viajar, no quedarse en el log.
---

# Puertas de densidad de material narrativo

**Regla 1:** un juez LLM que describe una densidad como "al limite / justa / minima" y aun asi da apto es una fuga cronica. La regla del margen debe estar en el prompt Y respaldada por un validador determinista en codigo que cuente los campos ESTRUCTURADOS (arrays con forma fija) y degrade el veredicto. Los campos de texto libre se dejan al juicio del LLM (contarlos da falsos positivos).

**Regla 2:** cuando una puerta agota su presupuesto y decide "continuar con lo mejor visto", los deficits detectados NO pueden quedarse solo documentados en el log — deben inyectarse como instruccion dura a la fase siguiente para que compense activamente. Un fallback que sigue igual convierte la puerta en teatro.

**Why:** caso real — base de 35 caps nacio con secretos "al limite", el auditor dio apto 7/10 y el acto 2 se estanco (caps repitiendo la misma situacion por falta de ideas); los lectores solo supieron proponer borrar capitulos. Los auditores de escaleta miran la FORMA; no pueden inventar material que falta en la base.

**How to apply:** al añadir/tocar cualquier puerta de calidad pre-escritura, comprobar: (a) prohibicion explicita del "apto al limite" en el prompt, (b) conteo determinista de lo contable, (c) que TODOS los caminos de salida de la puerta (apto, reuso no-apto, fallback clasico) propaguen el feedback. El usuario prefiere gastar mas iteraciones de fortificacion (baratas, sin escaleta) antes que dejar nacer una novela debil.
