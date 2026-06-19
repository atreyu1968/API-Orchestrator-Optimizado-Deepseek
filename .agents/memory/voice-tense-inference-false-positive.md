---
name: Voz narrativa — falso positivo de tiempo verbal
description: Por qué "presente narrativo"/"en presente" NO es tiempo verbal, y por qué un canon de voz INFERIDO no debe gatear veredictos CRÍTICOS.
---

# Voz narrativa: tiempo verbal inferido vs cronología

La voz narrativa (POV + tiempo verbal) se infiere por regex sobre el texto LIBRE
de la guía de estilo cuando el campo estructurado del proyecto (`narrative_voice`
jsonb) está vacío — que en la práctica es SIEMPRE.

## Regla 1: "presente"/"pasado" en una guía NO implican tiempo verbal

En guías de thriller/novela, "presente" y "pasado" casi siempre describen la
CRONOLOGÍA de la historia (el "ahora" narrativo frente a los flashbacks) o la
AMBIENTACIÓN (época), NO el tiempo verbal gramatical. Ejemplos reales que
rompieron el sistema:
- "la investigación avanza en presente con flashbacks que revelan el pasado"
- "transcurren en una sola línea temporal, la del presente narrativo"

**Por tanto:** solo inferir tiempo verbal con una pista GRAMATICAL explícita
("tiempo/verbo(s) presente|pasado", "tiempo verbal: X", "narrado/a en X",
"pretérito ..."). Nunca con un suelto "en presente"/"en pasado".

**Why:** un patrón suelto fabricó un canon "presente" fantasma en una novela
noir escrita (correctamente) en pasado; el Revisor Final lo marcó como CRÍTICO
global e irreparable. El manuscrito estaba bien; el detector estaba mal.

## Regla 2: distingue canon FUERTE (explícito) de canon DÉBIL (inferido)

El tiempo verbal puede venir de dos sitios: del bloque de voz EXPLÍCITO fijado
por el usuario (fuerte) o de la regex sobre la guía libre (débil, falible). Hay
que marcar el origen (`tenseSource: canonical|inferred`).

**How to apply:** un desajuste GLOBAL de SOLO tiempo verbal cuando el canon es
INFERIDO no debe elevarse a CRÍTICO en revisión — lo más probable es que la
inferencia se equivocara, no el manuscrito; degrádalo a aviso MENOR. El POV es
mucho más fiable (la guía sí lo dice explícitamente) y conserva criterio duro.
La regla general: un veredicto irreversible/bloqueante no debe apoyarse en una
señal que sabes que es heurística y propensa a falsos positivos.
