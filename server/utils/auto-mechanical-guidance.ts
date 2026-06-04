import type { StructuralAuditProblem } from "../agents/scene-shape-auditor";

const AREA_LABEL: Record<string, string> = {
  forma_escena: "Forma de escena",
  ledger_info: "Ledger de información",
  dosificacion_revelacion: "Dosificación de revelaciones",
  arco_secreto: "Arco secreto / reveal interno protagonista",
  falso_aliado: "Falso aliado",
  escalada_acto2: "Escalada dramática del acto 2",
  deus_ex_machina: "Anti deus ex machina",
  trauma_protagonista: "Trauma del protagonista",
  arco_secundario: "Continuidad de arco secundario",
};

const AREA_RULE: Record<string, string> = {
  arco_secreto:
    'REGLA MECÁNICA: para cada revelación de arco_secreto con siembra insuficiente, en CADA capítulo previo declarado en "setup_capitulos" AÑADE en su campo "informacion_nueva" una frase corta que MENCIONE LITERALMENTE alguno de los tokens del hecho (nombres propios, lugares, objetos). Si la revelación es dificultad "alto" necesitas ≥3 caps previos con tokens; si es "medio" ≥2. NO te limites a declarar los caps, el texto de esos caps debe contener la palabra.',
  escalada_acto2:
    'REGLA MECÁNICA: si 3 caps consecutivos del acto 2 tienen la misma "apuesta_dramatica" o decreciente, el 4º DEBE subir un escalón (baja→media→alta→critica). Para subir el escalón añade una pérdida irreversible al cap: un aliado herido, una identidad expuesta, una orden de detención, una norma propia traicionada.',
  ledger_info:
    'REGLA MECÁNICA: en cualquier ventana de 4 caps consecutivos del acto 2, ninguna "categoria_info_nueva" puede repetirse más de 2 veces. Diversifica obligatoriamente entre: testigo, evidencia_fisica, pista_falsa, revelacion_personal, antecedente_historico, conexion_red, amenaza, vinculo_emocional, setup_subtrama.',
  dosificacion_revelacion:
    'REGLA MECÁNICA: PROHIBIDO marcar "modo_extraccion: sin_resistencia" en revelaciones de dificultad "alto" o "medio". Usa siempre uno justificado: presion_fisica, amenaza_a_tercero, evidencia_irrefutable, error_del_personaje u ofrecimiento_voluntario_motivado.',
  forma_escena:
    'REGLA MECÁNICA: en cualquier ventana de 4 caps consecutivos, ninguna "forma_dominante" puede repetirse más de 2 veces. Alterna entre investigacion_activa, confrontacion_directa, setback, introspeccion, pivote_relacional, persecucion, infiltracion.',
  deus_ex_machina:
    'REGLA MECÁNICA: toda ayuda externa decisiva en el clímax debe tener "setup_capitulos" con ≥2 caps previos que la siembren textualmente (mismo criterio que arco_secreto). Si no puedes sembrarla, sustituye la ayuda por un recurso del propio protagonista.',
  falso_aliado:
    'REGLA MECÁNICA: el reveal de un falso aliado debe ocurrir entre el 50% y el 75% del recorrido (acto 2 tardío), nunca después. Si el cap del reveal cae fuera de ese rango, muévelo dentro y reorganiza las pistas previas.',
  trauma_protagonista:
    'REGLA MECÁNICA: cualquier reveal completo del trauma del protagonista debe tener ≥3 caps previos con menciones parciales (sueño, recuerdo intrusivo, evitación de un lugar, fobia concreta).',
  arco_secundario:
    'REGLA MECÁNICA: todo personaje secundario con "arco_transformacion" declarado en la World Bible debe aparecer (mencionado por su nombre en la escaleta) de forma repartida: al menos 1 escena en el acto 1, ≥1 escena intermedia cada ~40% del libro (sin brechas mayores) y ≥1 escena en el último tercio donde reciba la consecuencia de su arco (su "estado_final"). PROHIBIDO el cierre fantasma: un secundario que reaparece solo en el último capítulo para cerrar su arco sin escenas intermedias. Si el personaje no es relevante, quítale el "arco_transformacion".',
};

export function generateMechanicalGuidanceFromProblems(
  problemas: StructuralAuditProblem[],
  bestScore: number,
  threshold: number,
  // [Fix143-B] Cuando el agregado SÍ cruza el umbral pero una dimensión crítica
  // de segunda mitad sigue KO, el intro por defecto ("por debajo del mínimo
  // publicable") sería falso y confundiría al Arquitecto. Si llega `reason`, se
  // usa como frase de apertura en su lugar.
  reason?: string,
): string {
  if (!problemas || problemas.length === 0) return "";

  const byArea: Map<string, StructuralAuditProblem[]> = new Map();
  for (const p of problemas) {
    const list = byArea.get(p.area) || [];
    list.push(p);
    byArea.set(p.area, list);
  }

  const altas = problemas.filter(p => p.severidad === "alta").length;
  const medias = problemas.filter(p => p.severidad === "media").length;
  const bajas = problemas.filter(p => p.severidad === "baja").length;

  const lines: string[] = [];
  lines.push("═══════════════════════════════════════════════════════════════════");
  lines.push("[GUIDANCE MECÁNICA AUTO-GENERADA (Fix118)]");
  lines.push("═══════════════════════════════════════════════════════════════════");
  lines.push(
    `${reason ? reason : `Tu intento anterior se quedó en ${bestScore}/10, por debajo del mínimo publicable ${threshold}/10.`} El Auditor Estructural detectó ${problemas.length} problemas residuales (${altas} alta(s), ${medias} media(s), ${bajas} baja(s)). El sistema ha extraído de ellos un conjunto de correcciones MECÁNICAS que debes aplicar EXACTAMENTE en el rediseño. No improvises: cada problema lista los caps afectados y los tokens concretos que necesitas usar.`,
  );
  lines.push("");
  lines.push("PRINCIPIOS NO NEGOCIABLES:");
  lines.push(
    `1. Mantén el rango de capítulos (no podes la escaleta). Si la generación previa fue rechazada por número de caps fuera de rango, asegúrate de quedarte dentro.`,
  );
  lines.push("2. PRESERVA todas las dimensiones que ya estaban OK; solo corrige lo que se lista abajo.");
  lines.push(
    "3. Aplica las reglas mecánicas tal cual están redactadas; son verificables por el auditor mediante búsqueda textual de tokens.",
  );
  lines.push("");

  const orderedAreas = Array.from(byArea.keys()).sort((a, b) => {
    const sevA = Math.max(...(byArea.get(a) || []).map(p => (p.severidad === "alta" ? 3 : p.severidad === "media" ? 2 : 1)));
    const sevB = Math.max(...(byArea.get(b) || []).map(p => (p.severidad === "alta" ? 3 : p.severidad === "media" ? 2 : 1)));
    return sevB - sevA;
  });

  for (const area of orderedAreas) {
    const items = byArea.get(area)!;
    const label = AREA_LABEL[area] || area;
    lines.push(`── ${label.toUpperCase()} (${items.length} problema${items.length === 1 ? "" : "s"}) ──`);
    const rule = AREA_RULE[area];
    if (rule) {
      lines.push(rule);
      lines.push("");
    }
    items.forEach((p, idx) => {
      const capsTxt = p.capitulos.length > 0 ? `caps ${p.capitulos.join(", ")}` : "global";
      lines.push(`${idx + 1}. [${p.severidad}] ${capsTxt}`);
      lines.push(`   Problema: ${p.descripcion}`);
      if (p.sugerencia) lines.push(`   Acción concreta: ${p.sugerencia}`);
      lines.push("");
    });
  }

  lines.push("CIERRE: tras aplicar estas correcciones, verifica mentalmente que (a) el nº de capítulos sigue en rango, (b) ningún cap previamente OK pasa a tener problemas nuevos, (c) los tokens textuales pedidos están literalmente escritos en los campos indicados.");
  lines.push("═══════════════════════════════════════════════════════════════════");
  return lines.join("\n");
}
