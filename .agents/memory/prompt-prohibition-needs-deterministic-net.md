---
name: Prohibicion en prompt necesita red determinista
description: Un planner LLM al que se le prohibe una accion la propone igual; el ejecutor con la prohibicion espejo produce no-ops que queman presupuesto.
---

# Prohibir en el prompt no basta: traducir deterministicamente

Cuando un agente planificador tiene PROHIBIDA una accion (p.ej. fusionar/eliminar capitulos) pero esa accion es la solucion "natural" al defecto que ve, la propone igual. Si el ejecutor tiene la prohibicion espejo, recibe ordenes contradictorias: reescrituras confusas o no-ops que QUEMAN intentos y presupuesto sin que nadie lo note (el contador de reparaciones sube igual).

**Por que:** visto en log real — el planner de reparacion mid-novela propuso "fusionar caps 4/7/13" con su prompt prohibiendolo explicitamente.

**Como aplicar:** doble capa. (1) En el prompt del planner, no solo prohibir: dar la TRADUCCION que debe hacer el mismo (reformular la cirugia como reescrituras por capitulo con funcion nueva). (2) Red determinista en el ejecutor: regex sobre texto NORMALIZADO (minusculas + sin tildes, o los verbos conjugados con tilde se escapan) que detecte el verbo prohibido cerca de su objeto (<=2 palabras, o llueven falsos positivos con usos figurados como "la fusion de las familias") y anexe una traduccion obligatoria a la instruccion, conservando la intencion editorial en vez de descartarla.
