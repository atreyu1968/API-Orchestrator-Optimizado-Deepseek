// [Fix92] Auditor estructural determinista (sin LLM, sin coste de tokens).
// Examina la escaleta del Arquitecto en tres dimensiones que producen las
// críticas recurrentes del Lector Beta sobre el segundo acto:
//   (1) VARIEDAD DE FORMA DE ESCENA — ventana deslizante de 4 caps del acto 2.
//   (2) LEDGER DE INFORMACIÓN NUEVA — anti "no obtiene nada x4 caps seguidos".
//   (3) DOSIFICACIÓN DE REVELACIONES — anti info-dump tipo "Cifuentes confiesa
//       toda su historia de golpe en cap 21" / "Poncio habla demasiado fácil".
//
// Se integra con el mismo patrón de retry que el PlotIntegrityAuditor: si la
// puntuación cae por debajo del umbral, devuelve un bloque "instrucciones_
// revision" que el orquestador inyecta al Arquitecto como structuralAudit-
// Feedback para que rediseñe la escaleta.

export type FormaEscena =
  | "investigacion_activa"
  | "confrontacion_directa"
  | "revelacion"
  | "introspeccion"
  | "accion_fisica"
  | "setback"
  | "atmosferica"
  | "pivote_relacional";

export const FORMA_ESCENA_VALORES: FormaEscena[] = [
  "investigacion_activa",
  "confrontacion_directa",
  "revelacion",
  "introspeccion",
  "accion_fisica",
  "setback",
  "atmosferica",
  "pivote_relacional",
];

export type CategoriaInfoNueva =
  | "testigo"
  | "evidencia_fisica"
  | "pista_falsa"
  | "revelacion_personal"
  | "antecedente_historico"
  | "conexion_red"
  | "amenaza"
  | "vinculo_emocional"
  | "setup_subtrama"
  | "ninguna";

export const CATEGORIA_INFO_VALORES: CategoriaInfoNueva[] = [
  "testigo",
  "evidencia_fisica",
  "pista_falsa",
  "revelacion_personal",
  "antecedente_historico",
  "conexion_red",
  "amenaza",
  "vinculo_emocional",
  "setup_subtrama",
  "ninguna",
];

export type ModoExtraccion =
  | "presion_fisica"
  | "amenaza_a_tercero"
  | "evidencia_irrefutable"
  | "error_del_personaje"
  | "ofrecimiento_voluntario_motivado"
  | "sin_resistencia";

export const MODO_EXTRACCION_VALORES: ModoExtraccion[] = [
  "presion_fisica",
  "amenaza_a_tercero",
  "evidencia_irrefutable",
  "error_del_personaje",
  "ofrecimiento_voluntario_motivado",
  "sin_resistencia",
];

export interface StructuralAuditProblem {
  area: "forma_escena" | "ledger_info" | "dosificacion_revelacion";
  tipo: string;
  severidad: "alta" | "media" | "baja";
  capitulos: number[];
  descripcion: string;
  sugerencia: string;
}

export interface StructuralAuditCoverage {
  forma_dominante_pct: number;
  categoria_info_pct: number;
  revelaciones_dosificadas_pct: number;
}

export interface StructuralAuditResult {
  puntuacion_global: number;
  veredicto: "apto" | "necesita_revision" | "reescribir";
  problemas: StructuralAuditProblem[];
  coverage: StructuralAuditCoverage;
  resumen: string;
  instrucciones_revision: string;
}

// Frases que indican "informacion_nueva" de relleno. Detectadas en el informe
// del Beta sobre "El eco del asfalto" caps 8-17.
const FRASES_RELLENO_INFO = [
  "ninguna",
  "sin novedades",
  "nada nuevo",
  "no obtiene nada",
  "callejón sin salida",
  "callejon sin salida",
  "sin información",
  "sin informacion",
  "no avanza",
  "vuelve sin nada",
  "sin pistas",
];

function isRellenoInfo(s: any): boolean {
  if (!s || typeof s !== "string") return true;
  const t = s.toLowerCase().trim();
  if (t.length < 40) return true;
  return FRASES_RELLENO_INFO.some((f) => t.includes(f));
}

function capNum(c: any): number {
  return c?.numero ?? c?.number ?? 0;
}

function getActSlices(escaleta: any[]) {
  const regular = (escaleta || []).filter((c: any) => capNum(c) >= 1);
  const total = regular.length;
  const a1End = Math.floor(total * 0.25);
  const a2End = Math.floor(total * 0.75);
  return {
    all: regular,
    act1: regular.slice(0, a1End),
    act2: regular.slice(a1End, a2End),
    act3: regular.slice(a2End),
    total,
  };
}

// ────────────────────────────────────────────────────────────────────
// (1) Forma de escena — ventana deslizante de 4 caps en el acto 2.
// Catálogo de 8 valores; ningún valor puede aparecer más de 2 veces en una
// ventana. Complementa "tipo_capitulo" (A-N, estructural) describiendo lo
// que EXPERIMENTA EL LECTOR, no la estructura del capítulo.
// ────────────────────────────────────────────────────────────────────
function auditFormaEscena(escaleta: any[]): { problemas: StructuralAuditProblem[]; coverage: number } {
  const { act2, all } = getActSlices(escaleta);
  const total = all.length;
  const withForma = all.filter(
    (c: any) => typeof c.forma_dominante === "string" && c.forma_dominante.trim()
  );
  const coverage = total > 0 ? withForma.length / total : 0;
  const problemas: StructuralAuditProblem[] = [];

  if (total > 0 && coverage < 0.5) {
    const ausentes = all.filter((c: any) => !c.forma_dominante).map(capNum);
    problemas.push({
      area: "forma_escena",
      tipo: "forma_dominante_ausente",
      severidad: "media",
      capitulos: ausentes,
      descripcion: `Solo ${Math.round(coverage * 100)}% de los capítulos declaran "forma_dominante". Sin este campo no se puede garantizar variedad de escena en el acto 2.`,
      sugerencia: `Asigna a cada capítulo regular un valor de "forma_dominante" del catálogo: ${FORMA_ESCENA_VALORES.join(", ")}. Es independiente del "tipo_capitulo" (A-N): describe la FORMA que percibe el lector, no la estructura del capítulo. Un mismo "tipo_capitulo: E (investigacion)" puede tener forma_dominante "investigacion_activa", "confrontacion_directa", "setback" o "pivote_relacional" según cómo se desarrolle la escena.`,
    });
  }

  if (act2.length < 4) {
    return { problemas, coverage };
  }

  const WINDOW = 4;
  const MAX_REPEAT = 2;
  const flagged = new Map<string, Set<number>>();
  for (let i = 0; i <= act2.length - WINDOW; i++) {
    const win = act2.slice(i, i + WINDOW);
    const counts: Record<string, any[]> = {};
    for (const c of win) {
      const f = (c.forma_dominante || "").toString().trim().toLowerCase();
      if (!f) continue;
      (counts[f] ||= []).push(c);
    }
    for (const [forma, caps] of Object.entries(counts)) {
      if (caps.length > MAX_REPEAT) {
        if (!flagged.has(forma)) flagged.set(forma, new Set());
        for (const c of caps) flagged.get(forma)!.add(capNum(c));
      }
    }
  }
  for (const [forma, capSet] of flagged.entries()) {
    const caps = [...capSet].sort((a, b) => a - b);
    problemas.push({
      area: "forma_escena",
      tipo: "forma_repetida_en_ventana",
      severidad: "alta",
      capitulos: caps,
      descripcion: `La forma de escena "${forma}" se repite más de ${MAX_REPEAT} veces en una ventana de ${WINDOW} capítulos consecutivos del acto 2 (caps ${caps.join(", ")}). El lector percibe el segundo acto como monótono ("siempre pasa lo mismo aunque cambien los detalles").`,
      sugerencia: `Reescribe al menos uno de esos capítulos cambiando su "forma_dominante" a una distinta. Mantén el avance de la trama pero cambia QUÉ EXPERIMENTA EL LECTOR: si todos son "investigacion_activa", convierte uno en "confrontacion_directa" (un cara a cara tenso con stakes en mesa), otro en "setback" (el protagonista pierde algo concreto que tenía), otro en "introspeccion" o "pivote_relacional" (una relación entre dos personajes cambia de estado).`,
    });
  }

  return { problemas, coverage };
}

// ────────────────────────────────────────────────────────────────────
// (2) Ledger de información nueva — anti "Zubiri va, no obtiene nada, vuelve" x4.
// Tres comprobaciones:
//   (a) "informacion_nueva" no puede ser de relleno en 2 caps consecutivos del
//       acto 2/3 (texto < 40 chars o frases tipo "callejón sin salida").
//   (b) "categoria_info_nueva" no puede repetirse más de 2 veces en ventana
//       de 4 caps del acto 2.
//   (c) Si la cobertura del campo es <50% se reclama explícitamente.
// ────────────────────────────────────────────────────────────────────
function auditLedgerInfo(escaleta: any[]): { problemas: StructuralAuditProblem[]; coverage: number } {
  const { act2, act3, all } = getActSlices(escaleta);
  const total = all.length;
  const withCat = all.filter(
    (c: any) => typeof c.categoria_info_nueva === "string" && c.categoria_info_nueva.trim()
  );
  const coverage = total > 0 ? withCat.length / total : 0;
  const problemas: StructuralAuditProblem[] = [];

  if (total > 0 && coverage < 0.5) {
    const ausentes = all.filter((c: any) => !c.categoria_info_nueva).map(capNum);
    problemas.push({
      area: "ledger_info",
      tipo: "categoria_info_ausente",
      severidad: "media",
      capitulos: ausentes,
      descripcion: `Solo ${Math.round(coverage * 100)}% de los capítulos declaran "categoria_info_nueva". Sin esta etiqueta no se puede garantizar que el lector reciba descubrimientos variados.`,
      sugerencia: `Etiqueta cada capítulo regular con una "categoria_info_nueva" del catálogo: ${CATEGORIA_INFO_VALORES.join(", ")}. Usa "ninguna" SOLO en capítulos atmosféricos/introspectivos puros y nunca en dos capítulos consecutivos.`,
    });
  }

  // (a) Relleno en consecutivos del acto 2 + acto 3
  const mid = [...act2, ...act3];
  const rellenoPairs: number[] = [];
  for (let i = 0; i < mid.length - 1; i++) {
    if (isRellenoInfo(mid[i].informacion_nueva) && isRellenoInfo(mid[i + 1].informacion_nueva)) {
      rellenoPairs.push(capNum(mid[i]), capNum(mid[i + 1]));
    }
  }

  // (a.bis) categoria_info_nueva === "ninguna" dos caps consecutivos (acto 2/3).
  // Regla explícita del prompt, independiente del relleno textual.
  const ningunaPairs: number[] = [];
  for (let i = 0; i < mid.length - 1; i++) {
    const a = String(mid[i].categoria_info_nueva || "").toLowerCase().trim();
    const b = String(mid[i + 1].categoria_info_nueva || "").toLowerCase().trim();
    if (a === "ninguna" && b === "ninguna") {
      ningunaPairs.push(capNum(mid[i]), capNum(mid[i + 1]));
    }
  }
  if (ningunaPairs.length > 0) {
    const unique = [...new Set(ningunaPairs)].sort((a, b) => a - b);
    problemas.push({
      area: "ledger_info",
      tipo: "ninguna_consecutiva",
      severidad: "alta",
      capitulos: unique,
      descripcion: `Capítulos consecutivos del acto 2/3 con "categoria_info_nueva: ninguna" (caps ${unique.join(", ")}). El lector pasa dos capítulos seguidos sin descubrir nada — patrón explícitamente prohibido.`,
      sugerencia: `Asigna a uno de cada par una categoría real del catálogo (testigo, evidencia_fisica, pista_falsa, revelacion_personal, antecedente_historico, conexion_red, amenaza, vinculo_emocional, setup_subtrama) y rellena "informacion_nueva" con la pieza concreta correspondiente.`,
    });
  }
  if (rellenoPairs.length > 0) {
    const unique = [...new Set(rellenoPairs)].sort((a, b) => a - b);
    problemas.push({
      area: "ledger_info",
      tipo: "info_nueva_relleno_consecutivo",
      severidad: "alta",
      capitulos: unique,
      descripcion: `Dos o más capítulos consecutivos del acto 2/3 tienen "informacion_nueva" vacía o de relleno (texto < 40 caracteres o frases tipo "ninguna", "sin novedades", "no obtiene nada", "callejón sin salida"). Caps afectados: ${unique.join(", ")}. Es el patrón "el protagonista va a un sitio, no consigue nada, vuelve, repite" que el Lector Beta marca como segundo acto monótono.`,
      sugerencia: `En cada uno de esos capítulos, el protagonista puede fracasar en su objetivo, pero el LECTOR debe ganar al menos una pieza nueva. Reescribe "informacion_nueva" con un párrafo concreto (≥40 caracteres) que diga QUÉ aprende el lector aunque el protagonista no avance: un detalle del trauma pasado del prota, una pista falsa sembrada por el antagonista, un vínculo emocional con un secundario, una amenaza menor que escala el peligro, un antecedente histórico del lugar.`,
    });
  }

  // (b) Categoría repetida en ventana de 4 caps del acto 2
  if (act2.length >= 4) {
    const WINDOW = 4;
    const MAX_REPEAT = 2;
    const flagged = new Map<string, Set<number>>();
    for (let i = 0; i <= act2.length - WINDOW; i++) {
      const win = act2.slice(i, i + WINDOW);
      const counts: Record<string, any[]> = {};
      for (const c of win) {
        const cat = (c.categoria_info_nueva || "").toString().trim().toLowerCase();
        if (!cat) continue;
        (counts[cat] ||= []).push(c);
      }
      for (const [cat, caps] of Object.entries(counts)) {
        if (caps.length > MAX_REPEAT) {
          if (!flagged.has(cat)) flagged.set(cat, new Set());
          for (const c of caps) flagged.get(cat)!.add(capNum(c));
        }
      }
    }
    for (const [cat, capSet] of flagged.entries()) {
      const caps = [...capSet].sort((a, b) => a - b);
      problemas.push({
        area: "ledger_info",
        tipo: "categoria_repetida_en_ventana",
        severidad: cat === "ninguna" ? "alta" : "media",
        capitulos: caps,
        descripcion: `La categoría de información "${cat}" se repite más de ${MAX_REPEAT} veces en una ventana de ${WINDOW} capítulos del acto 2 (caps ${caps.join(", ")}). El lector recibe siempre el mismo TIPO de descubrimiento.`,
        sugerencia: `Diversifica las categorías de información en esa ventana. Si dominan "testigo" o "evidencia_fisica", introduce un "vinculo_emocional" (una relación humana se revela), una "revelacion_personal" del propio protagonista (algo de su pasado), una "pista_falsa" sembrada por el antagonista para despistar, o una "amenaza" nueva que escale el peligro.`,
      });
    }
  }

  return { problemas, coverage };
}

// ────────────────────────────────────────────────────────────────────
// (3) Dosificación de revelaciones — anti info-dump tipo "Cifuentes confiesa
// toda su historia de golpe en cap 21". Cuatro comprobaciones por cap:
//   (a) Revelación con dificultad alta y modo_extraccion = "sin_resistencia" → alta.
//   (b) Revelación con dificultad alta sin "setup_capitulos" → media.
//   (c) Cap con ≥3 revelaciones de dificultad alta → alta (info-dump).
//   (d) Antagonista/cómplice que revela ≥3 hechos en un único cap → alta.
// ────────────────────────────────────────────────────────────────────
function auditDosificacion(
  escaleta: any[],
  worldBible: any
): { problemas: StructuralAuditProblem[]; coverage: number } {
  const { all } = getActSlices(escaleta);
  const withRev = all.filter(
    (c: any) => Array.isArray(c.revelaciones_dosificadas) && c.revelaciones_dosificadas.length > 0
  );
  // Cobertura medida solo sobre caps que "deberían" llevar revelación: tipo M
  // (revelacion), J (confrontacion) o con eventos_pivotales declarados.
  const expectsRev = all.filter((c: any) => {
    const tipo = String(c.tipo_capitulo || "").toUpperCase();
    const pivotes = Array.isArray(c.eventos_pivotales) ? c.eventos_pivotales.length : 0;
    return tipo === "M" || tipo === "J" || pivotes > 0;
  });
  const coverage =
    expectsRev.length > 0 ? withRev.length / Math.max(expectsRev.length, 1) : (withRev.length > 0 ? 1 : 0);
  const problemas: StructuralAuditProblem[] = [];

  // Lista de antagonistas/cómplices (por rol). Sirve para detectar
  // info-dumps específicos del villano.
  const personajes: any[] =
    worldBible?.personajes || worldBible?.world_bible?.personajes || [];
  const stripAccents = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  // Normaliza nombre eliminando honoríficos y signos para hacer matching tolerante.
  const HONORIFICOS = /\b(don|doña|dona|sr|sra|srta|señor|senor|señora|senora|señorita|senorita|inspector|inspectora|comisario|comisaria|teniente|sargento|capitán|capitan|doctor|doctora|dr|dra|padre|madre|fray|sor|tío|tio|tía|tia)\b/g;
  const normalizeName = (s: string) =>
    stripAccents(s).replace(HONORIFICOS, "").replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  const antagonistasFullNames: string[] = personajes
    .filter((p: any) => {
      const rol = String(p.rol || p.role || "").toLowerCase();
      return (
        rol.includes("antag") ||
        rol.includes("villan") ||
        rol.includes("adversari") ||
        rol.includes("enemigo") ||
        rol.includes("complice") ||
        rol.includes("cómplice") ||
        rol.includes("traidor")
      );
    })
    .map((p: any) => normalizeName(String(p.nombre || p.name || "")))
    .filter(Boolean);
  // Tokens individuales (apellidos / nombres sueltos) para matching por contención.
  const antagonistasTokens = new Set<string>();
  for (const full of antagonistasFullNames) {
    antagonistasTokens.add(full);
    for (const tok of full.split(/\s+/)) {
      if (tok.length >= 3) antagonistasTokens.add(tok);
    }
  }
  const isAntagonista = (revelador: string): boolean => {
    const norm = normalizeName(revelador);
    if (!norm) return false;
    if (antagonistasTokens.has(norm)) return true;
    // Coincidencia por contención bidireccional para alias/apellidos.
    for (const tok of antagonistasTokens) {
      if (tok.length >= 3 && (norm.includes(tok) || tok.includes(norm))) return true;
    }
    return false;
  };

  for (const cap of all) {
    const num = capNum(cap);
    const revs: any[] = Array.isArray(cap.revelaciones_dosificadas)
      ? cap.revelaciones_dosificadas
      : [];
    if (revs.length === 0) continue;

    // (a) dificultad alta + sin_resistencia
    const sinResistencia = revs.filter(
      (r: any) =>
        String(r?.dificultad || "").toLowerCase() === "alto" &&
        String(r?.modo_extraccion || "").toLowerCase() === "sin_resistencia"
    );
    if (sinResistencia.length > 0) {
      const hechos = sinResistencia
        .map((r: any) => `"${String(r.hecho_revelado || "").slice(0, 80)}"`)
        .join("; ");
      problemas.push({
        area: "dosificacion_revelacion",
        tipo: "revelacion_alta_sin_resistencia",
        severidad: "alta",
        capitulos: [num],
        descripcion: `El capítulo ${num} contiene ${sinResistencia.length} revelación(es) de "dificultad: alto" con "modo_extraccion: sin_resistencia" (${hechos}). Es el patrón "el personaje habla demasiado fácil" / "el villano se vacía de golpe".`,
        sugerencia: `Para cada revelación importante declara un "modo_extraccion" justificado: presion_fisica (el prota le tiene contra las cuerdas), amenaza_a_tercero (la familia/un aliado del personaje está en riesgo), evidencia_irrefutable (el prota le pone delante una prueba que ya no puede negar), error_del_personaje (un desliz por exceso de confianza, prisa o ira) u ofrecimiento_voluntario_motivado (el personaje confiesa porque ha perdido a alguien o se sabe acorralado — con MOTIVO concreto sembrado en capítulos previos). Si la revelación no merece esfuerzo de extracción, baja su dificultad a medio/bajo o repártela en varias escenas.`,
      });
    }

    // (b) dificultad alta sin setup_capitulos
    const sinSetup = revs.filter(
      (r: any) =>
        String(r?.dificultad || "").toLowerCase() === "alto" &&
        (!Array.isArray(r?.setup_capitulos) || r.setup_capitulos.length === 0)
    );
    if (sinSetup.length > 0) {
      problemas.push({
        area: "dosificacion_revelacion",
        tipo: "revelacion_alta_sin_setup",
        severidad: "media",
        capitulos: [num],
        descripcion: `El capítulo ${num} contiene revelación(es) de dificultad alta sin "setup_capitulos" declarados. El lector no ha visto antes la dificultad de extracción y la confesión cae a peso muerto.`,
        sugerencia: `Para cada revelación de dificultad alta lista los números de capítulos previos donde se sembró la resistencia del personaje: escenas donde se negó a hablar, donde se vio su miedo, donde apareció la amenaza que ahora lo desbloquea, donde se mostró el coste de revelarlo.`,
      });
    }

    // (c) Info-dump: ≥3 hechos dificultad alta en un mismo cap
    const altos = revs.filter(
      (r: any) => String(r?.dificultad || "").toLowerCase() === "alto"
    );
    if (altos.length >= 3) {
      problemas.push({
        area: "dosificacion_revelacion",
        tipo: "info_dump_de_revelaciones",
        severidad: "alta",
        capitulos: [num],
        descripcion: `El capítulo ${num} concentra ${altos.length} revelaciones de dificultad alta en una sola escena. Es un info-dump expositivo.`,
        sugerencia: `Reparte estas revelaciones en al menos 2 capítulos. En el primero, el personaje revela 1-2 hechos bajo presión y RETIENE el resto (declara qué retiene en el "objetivo_narrativo": "Cifuentes admite A y B pero niega C"). En un capítulo posterior, una presión DISTINTA (no la misma escalada) desbloquea lo que faltaba.`,
      });
    }

    // (d) Antagonista revela ≥3 hechos en un cap
    if (antagonistasTokens.size > 0) {
      const porAntag: Record<string, any[]> = {};
      for (const r of revs) {
        const raw = String(r?.personaje_revelador || "").trim();
        if (raw && isAntagonista(raw)) {
          const key = normalizeName(raw) || raw.toLowerCase();
          (porAntag[key] ||= []).push(r);
        }
      }
      for (const [personaje, lista] of Object.entries(porAntag)) {
        if (lista.length >= 3) {
          problemas.push({
            area: "dosificacion_revelacion",
            tipo: "antagonista_confiesa_demasiado",
            severidad: "alta",
            capitulos: [num],
            descripcion: `En el capítulo ${num}, el personaje antagonista/cómplice "${personaje}" revela ${lista.length} hechos. Rompe la regla "el antagonista nunca se vacía de golpe": el lector pierde el deseo de seguir leyendo porque ya sabe todo lo del villano.`,
            sugerencia: `Reparte las revelaciones de "${personaje}" en al menos 2 escenas distintas con presión diferente cada vez. Pauta sugerida: primer encuentro suelta lo que NO le compromete (lo que el prota ya casi sabe), segunda escena suelta UN dato comprometedor bajo presión específica, tercera escena suelta el resto bajo amenaza nueva o ya derrotado.`,
          });
        }
      }
    }
  }

  if (coverage < 0.3 && expectsRev.length >= 3) {
    problemas.push({
      area: "dosificacion_revelacion",
      tipo: "dosificacion_no_declarada",
      severidad: "media",
      capitulos: expectsRev.map(capNum),
      descripcion: `Solo ${Math.round(coverage * 100)}% de los capítulos con revelación esperada declaran el array "revelaciones_dosificadas". Sin él no se puede auditar si las confesiones tienen resistencia ni si están repartidas.`,
      sugerencia: `En cada capítulo que contenga una revelación importante añade el array "revelaciones_dosificadas": [{ "hecho_revelado": "...", "personaje_revelador": "...", "dificultad": "alto|medio|bajo", "modo_extraccion": "presion_fisica|amenaza_a_tercero|evidencia_irrefutable|error_del_personaje|ofrecimiento_voluntario_motivado|sin_resistencia", "setup_capitulos": [n, n] }]. Es OBLIGATORIO para dificultad "alto".`,
    });
  }

  return { problemas, coverage };
}

// ────────────────────────────────────────────────────────────────────
// Helpers de instrucciones agrupadas (≤700 palabras).
// ────────────────────────────────────────────────────────────────────
function buildInstructions(problemas: StructuralAuditProblem[]): string {
  const byArea: Record<string, StructuralAuditProblem[]> = {};
  for (const p of problemas) (byArea[p.area] ||= []).push(p);
  const lines: string[] = [];
  lines.push("CORRECCIONES ESTRUCTURALES OBLIGATORIAS (Auditor de Forma/Ledger/Dosificación):");
  lines.push("");

  const renderArea = (title: string, list?: StructuralAuditProblem[]) => {
    if (!list || list.length === 0) return;
    lines.push(`# ${title}`);
    let i = 1;
    for (const p of list) {
      const caps = p.capitulos.length ? p.capitulos.join(", ") : "—";
      lines.push(`${i++}. [${p.severidad.toUpperCase()}] Caps ${caps}: ${p.descripcion}`);
      lines.push(`   → ${p.sugerencia}`);
    }
    lines.push("");
  };
  renderArea("1) VARIEDAD DE FORMA DE ESCENA", byArea["forma_escena"]);
  renderArea("2) LEDGER DE INFORMACIÓN NUEVA", byArea["ledger_info"]);
  renderArea("3) DOSIFICACIÓN DE REVELACIONES", byArea["dosificacion_revelacion"]);

  lines.push("REGLA ANTI-RECURRENCIA: en la próxima generación, declara y respeta ESTOS tres campos por capítulo:");
  lines.push(
    `- "forma_dominante" (1 valor de: ${FORMA_ESCENA_VALORES.join(", ")}). En ventanas de 4 caps consecutivos del acto 2, ningún valor puede repetirse más de 2 veces.`
  );
  lines.push(
    `- "categoria_info_nueva" (1 valor de: ${CATEGORIA_INFO_VALORES.join(", ")}). En el acto 2/3 no puede haber 2 caps consecutivos con "informacion_nueva" vacía o de relleno; en ventanas de 4 caps del acto 2 ningún valor puede repetirse más de 2 veces; "ninguna" no puede aparecer 2 veces seguidas.`
  );
  lines.push(
    `- "revelaciones_dosificadas" (array). Toda revelación con dificultad "alto" debe traer modo_extraccion != "sin_resistencia" y al menos 1 cap en setup_capitulos. Ningún cap puede acumular ≥3 revelaciones de dificultad alta. Ningún personaje antagonista/cómplice puede revelar ≥3 hechos en un único capítulo.`
  );
  return lines.join("\n");
}

// ────────────────────────────────────────────────────────────────────
// Entry point principal — llamado por el orquestador después del
// PlotIntegrityAuditor. Determinista (sin coste de tokens).
// ────────────────────────────────────────────────────────────────────
export function runArchitectStructuralAudits(
  escaleta: any[],
  worldBible: any
): StructuralAuditResult {
  const forma = auditFormaEscena(escaleta);
  const ledger = auditLedgerInfo(escaleta);
  const dos = auditDosificacion(escaleta, worldBible);

  const problemas = [...forma.problemas, ...ledger.problemas, ...dos.problemas];
  const altas = problemas.filter((p) => p.severidad === "alta").length;
  const medias = problemas.filter((p) => p.severidad === "media").length;

  const rawScore = 10 - 2 * altas - 0.7 * medias;
  const score = Math.max(1, Math.min(10, rawScore));
  let veredicto: "apto" | "necesita_revision" | "reescribir";
  if (altas === 0 && medias <= 1) veredicto = "apto";
  else if (altas <= 1 && medias <= 3) veredicto = "necesita_revision";
  else veredicto = "reescribir";

  const resumen = `Auditoría estructural: ${altas} problemas altos, ${medias} medios. Forma: ${forma.problemas.length}; Ledger: ${ledger.problemas.length}; Dosificación: ${dos.problemas.length}. Cobertura forma=${Math.round(forma.coverage * 100)}% ledger=${Math.round(ledger.coverage * 100)}% dosif=${Math.round(dos.coverage * 100)}%.`;

  return {
    puntuacion_global: Math.round(score * 10) / 10,
    veredicto,
    problemas,
    coverage: {
      forma_dominante_pct: Math.round(forma.coverage * 100) / 100,
      categoria_info_pct: Math.round(ledger.coverage * 100) / 100,
      revelaciones_dosificadas_pct: Math.round(dos.coverage * 100) / 100,
    },
    resumen,
    instrucciones_revision: problemas.length > 0 ? buildInstructions(problemas) : "",
  };
}
