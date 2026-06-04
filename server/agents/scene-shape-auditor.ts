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

// Catálogo extendido para CUALQUIER género (thriller, romance, fantasía,
// histórica, literaria, ciencia ficción, drama, aventura). Los 8 primeros
// valores cubren thriller/policíaco; los 6 nuevos cubren romance, fantasía
// y literatura. Cualquier capítulo debe encajar en uno (interpretado de
// forma generosa para no forzar etiquetas).
export type FormaEscena =
  | "investigacion_activa"
  | "confrontacion_directa"
  | "revelacion"
  | "introspeccion"
  | "accion_fisica"
  | "setback"
  | "atmosferica"
  | "pivote_relacional"
  | "escena_romantica"
  | "recuerdo_flashback"
  | "ceremonia_ritual"
  | "dialogo_filosofico"
  | "humor_alivio"
  | "montaje_temporal";

export const FORMA_ESCENA_VALORES: FormaEscena[] = [
  "investigacion_activa",
  "confrontacion_directa",
  "revelacion",
  "introspeccion",
  "accion_fisica",
  "setback",
  "atmosferica",
  "pivote_relacional",
  "escena_romantica",
  "recuerdo_flashback",
  "ceremonia_ritual",
  "dialogo_filosofico",
  "humor_alivio",
  "montaje_temporal",
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
  | "ninguna"
  | "confesion_emocional"
  | "regla_del_mundo"
  | "profecia_o_simbolo"
  | "memoria_revelada"
  | "declaracion_amorosa"
  | "ruptura_relacional"
  | "transformacion_personal";

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
  "confesion_emocional",
  "regla_del_mundo",
  "profecia_o_simbolo",
  "memoria_revelada",
  "declaracion_amorosa",
  "ruptura_relacional",
  "transformacion_personal",
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

// [Fix97-A] Apuesta dramática por capítulo. Ordinal: baja(1) < media(2) <
// alta(3) < critica(4). Mide cuánto cuesta al protagonista si fracasa en
// este capítulo: "baja" = inconveniencia; "media" = pérdida concreta;
// "alta" = pérdida irreversible / riesgo vital; "critica" = punto sin
// retorno, jugarse el arco entero. Universal a cualquier género.
export type ApuestaDramatica = "baja" | "media" | "alta" | "critica";
export const APUESTA_VALORES: ApuestaDramatica[] = ["baja", "media", "alta", "critica"];
const APUESTA_RANK: Record<string, number> = {
  baja: 1,
  media: 2,
  alta: 3,
  critica: 4,
  crítica: 4,
};

export interface StructuralAuditProblem {
  area:
    | "forma_escena"
    | "ledger_info"
    | "dosificacion_revelacion"
    | "arco_secreto"
    | "falso_aliado"
    | "escalada_acto2"
    | "deus_ex_machina"
    | "trauma_protagonista"
    | "arco_secundario";
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
  arco_secreto_pct: number;
  falso_aliado_pct: number;
  apuesta_dramatica_pct: number;
  deus_ex_machina_pct: number;
  trauma_protagonista_pct: number;
  arco_secundario_pct: number;
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
// (4) [Fix93] Arco completo del secreto — siembra REAL en ≥3 caps previos.
// El `setup_capitulos` declarado por el Arquitecto no basta: el auditor
// verifica que los caps anteriores mencionen efectivamente el hecho (por
// solapamiento de tokens significativos). Si una revelación de dificultad
// alta no tiene siembra textual previa en al menos 3 caps distintos, es
// info-dump aunque solo haya 1 revelación en el capítulo.
// ────────────────────────────────────────────────────────────────────
const STOPWORDS_ES = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "en",
  "y", "o", "u", "que", "se", "su", "sus", "lo", "le", "les", "a", "al",
  "por", "con", "para", "es", "son", "fue", "fueron", "era", "eran",
  "sin", "sobre", "no", "si", "este", "esta", "esos", "esas", "esto",
  "ya", "mas", "menos", "muy", "ha", "han", "hay", "tras", "entre", "como",
  "cuando", "donde", "porque", "pero", "ante", "bajo", "hacia", "hasta",
  "desde", "tambien", "tan", "todo", "toda", "todos", "todas", "algo",
  "alguien", "alguno", "alguna", "siempre", "nunca", "aun", "aunque",
  "cap", "capitulo", "capitulos",
]);

function extractSiembraTokens(text: string): string[] {
  if (!text || typeof text !== "string") return [];
  const t = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // [Fix96] Umbral bajado de 5 a 4 chars para capturar palabras
  // narrativamente críticas y cortas (topo, robo, arma, caso, dato, ruta,
  // amor, odio, celos, pacto, lazo) que antes se descartaban como ruido y
  // generaban falsos positivos de "siembra insuficiente".
  const tokens = t.split(/\s+/).filter((tok) => {
    if (tok.length < 4) return false;
    if (STOPWORDS_ES.has(tok)) return false;
    if (/^\d+$/.test(tok)) return false;
    return true;
  });
  return Array.from(new Set(tokens));
}

function capCorpus(c: any): string {
  const parts: string[] = [];
  const push = (v: any) => {
    if (typeof v === "string") parts.push(v);
    else if (Array.isArray(v)) for (const x of v) push(x);
    else if (v && typeof v === "object") for (const k of Object.values(v)) push(k);
  };
  push(c?.objetivo_narrativo);
  push(c?.sinopsis);
  push(c?.informacion_nueva);
  push(c?.eventos_pivotales);
  push(c?.beats);
  push(c?.escena_principal);
  push(c?.titulo);
  return parts.join(" ");
}

function auditArcoSecreto(
  escaleta: any[]
): { problemas: StructuralAuditProblem[]; coverage: number } {
  const { all } = getActSlices(escaleta);
  const problemas: StructuralAuditProblem[] = [];
  let totalRevAuditadas = 0;
  let sembradas = 0;

  // [Fix96 v2] Indexamos cada cap como SET de tokens (palabra completa),
  // no como string para `includes` substring. Antes "ruta" matcheaba dentro
  // de "rutina" o "rutinario" — falso positivo de siembra.
  const tokensByCap: Record<number, Set<string>> = {};
  for (const c of all) {
    const norm = capCorpus(c)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    tokensByCap[capNum(c)] = new Set(norm.split(/\s+/).filter(Boolean));
  }

  for (const cap of all) {
    const num = capNum(cap);
    const revs: any[] = Array.isArray(cap.revelaciones_dosificadas)
      ? cap.revelaciones_dosificadas
      : [];
    for (const r of revs) {
      const dificultad = String(r?.dificultad || "").toLowerCase();
      if (dificultad !== "alto" && dificultad !== "medio") continue;
      const hecho = String(r?.hecho_revelado || "");
      const tokens = extractSiembraTokens(hecho);
      if (tokens.length < 2) continue;
      totalRevAuditadas += 1;

      const priorCaps = all.filter((c: any) => capNum(c) < num);
      let siembraCount = 0;
      const sembradosEn: number[] = [];
      // [Fix96 v2] Identificamos qué tokens son nombres propios (heurística:
      // capitalizados en el hecho original + personaje_revelador). Un hit
      // de solo-nombre-propio NO basta como siembra (el nombre suele aparecer
      // por contexto sin sembrar el secreto). Necesitamos ≥1 token "fuerte"
      // (no nombre propio aislado) O ≥2 hits totales.
      const nombrePropioTokens = new Set<string>();
      const personajeRevelador = String(r?.personaje_revelador || "").trim();
      if (personajeRevelador) {
        for (const piece of personajeRevelador.split(/\s+/)) {
          const norm = piece
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase();
          if (norm.length >= 4) nombrePropioTokens.add(norm);
        }
      }
      for (const m of hecho.matchAll(/\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{3,}/g)) {
        const norm = m[0]
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase();
        nombrePropioTokens.add(norm);
      }
      for (const prev of priorCaps) {
        const capTokens = tokensByCap[capNum(prev)];
        if (!capTokens || capTokens.size === 0) continue;
        const hitTokens = tokens.filter((t) => capTokens.has(t));
        if (hitTokens.length === 0) continue;
        const fuertes = hitTokens.filter((t) => !nombrePropioTokens.has(t));
        if (fuertes.length >= 1 || hitTokens.length >= 2) {
          siembraCount += 1;
          sembradosEn.push(capNum(prev));
        }
      }
      const minSiembra = dificultad === "alto" ? 3 : 2;
      const hechoCorto = hecho.length > 90 ? hecho.slice(0, 87) + "..." : hecho;
      const declarados = Array.isArray(r?.setup_capitulos)
        ? r.setup_capitulos.filter(
            (n: any) => typeof n === "number" && n < num
          )
        : [];

      // [Fix96 v2] Crédito limitado por setup_capitulos: contamos SOLO los
      // declarados con hit textual real (declaradosConHit), no la longitud
      // bruta del array. Esto evita aprobar arcos con 1 siembra real + 2
      // declarados decorativos. El check setup_capitulos_decorativo más
      // abajo sigue avisando como media de los declarados sin hit.
      const declaradosConHit = declarados.filter((cap: number) =>
        sembradosEn.includes(cap)
      );
      const efectivamenteSembrados = Math.max(
        siembraCount,
        declaradosConHit.length
      );

      if (efectivamenteSembrados >= minSiembra) {
        sembradas += 1;
        // [Fix93] Discrepancia: el Arquitecto declaró setup_capitulos pero
        // los caps declarados NO contienen siembra textual real. La siembra
        // existe en otros caps, así que el suspense funciona, pero el
        // contrato del JSON es engañoso y debe corregirse.
        if (declarados.length > 0) {
          const noSembrados = declarados.filter(
            (cap: number) => !sembradosEn.includes(cap)
          );
          if (noSembrados.length > 0) {
            problemas.push({
              area: "arco_secreto",
              tipo: "setup_capitulos_decorativo",
              severidad: "media",
              capitulos: [num, ...noSembrados],
              descripcion: `El capítulo ${num} declara "setup_capitulos: [${declarados.join(", ")}]" para "${hechoCorto}", pero los caps ${noSembrados.join(", ")} NO contienen tokens del hecho. La siembra real está en otros caps (${sembradosEn.join(", ") || "ninguno"}). El array es decorativo y debe sincronizarse con la realidad textual.`,
              sugerencia: `Sustituye el array por los caps con siembra real (${sembradosEn.slice(0, minSiembra).join(", ")}) o añade tokens del hecho a los caps ${noSembrados.join(", ")} para que la declaración sea verdadera.`,
            });
          }
        }
        continue;
      }

      // [Fix96 v2] Severidad "alta" si NO hay respaldo textual real
      // (siembraCount === 0) para dificultad "alto", aunque haya
      // setup_capitulos declarados sin hit (array decorativo sin prosa que
      // construya el suspense). Si hubo siembra parcial (1-2 caps con hit
      // real), bajamos a "media" — el suspense existe aunque sea frágil.
      const sevSiembra =
        dificultad === "alto" && siembraCount === 0 ? "alta" : "media";
      problemas.push({
        area: "arco_secreto",
        tipo:
          dificultad === "alto"
            ? "siembra_textual_insuficiente_alto"
            : "siembra_textual_insuficiente_medio",
        severidad: sevSiembra,
        capitulos: [num],
        descripcion: `El capítulo ${num} revela "${hechoCorto}" (dificultad: ${dificultad}) pero el auditor solo encuentra siembra textual real en ${siembraCount} cap(s) anterior(es)${sembradosEn.length ? ` (caps ${sembradosEn.join(", ")})` : ""}. Se exigen ≥${minSiembra} para que el lector haya construido el suspense. Declarar "setup_capitulos: [${declarados.join(", ")}]" no basta si esos caps no MENCIONAN el hecho.`,
        sugerencia: `Antes del cap ${num}, siembra el hecho en al menos ${minSiembra} caps distintos con tokens concretos del hecho ("${tokens.slice(0, 5).join('", "')}"). Cada siembra puede ser: (i) una pista parcial en "informacion_nueva" (algo que no completa el hecho pero apunta), (ii) un detalle del personaje implicado en "objetivo_narrativo" que retroactivamente cobre sentido, (iii) un evento atmosférico en "eventos_pivotales" relacionado con el lugar/objeto del hecho. Si el material no admite ${minSiembra} siembras, reduce la dificultad a "bajo" (es un detalle de color, no un giro).`,
      });
    }
  }

  const coverage = totalRevAuditadas > 0 ? sembradas / totalRevAuditadas : 1;
  return { problemas, coverage };
}

// ────────────────────────────────────────────────────────────────────
// (5) [Fix94] Personaje de doble cara — generalización universal del
// patrón "traidor con máscara" para CUALQUIER género (no solo thriller).
//
// Cubre: topo / infiltrado / agente doble (thriller), amante o pretendiente
// que oculta su verdadera intención (romance), mentor que es el villano
// (fantasía / aventura), pariente con secreto familiar revelado tarde
// (literaria / drama familiar), elegido falso o profecía invertida
// (fantasía / mitología), antagonista enmascarado (cualquier género).
//
// Reglas (aplican igual independientemente del género):
//   (A) La revelación de la verdadera identidad/lealtad/secreto del
//       personaje no puede ocurrir antes del 60% del total de caps (si
//       ocurre antes, el lector lo ve venir y el giro pierde fuerza).
//   (B) Debe haber al menos 1 cap previo al reveal donde el personaje
//       aparezca con "forma_dominante" en {introspeccion, pivote_relacional,
//       escena_romantica, recuerdo_flashback} o "categoria_info_nueva" en
//       {vinculo_emocional, confesion_emocional, memoria_revelada} — la
//       escena de duda/humanización que hace doler la revelación, sea una
//       traición de espía o el descubrimiento de que el "amor verdadero"
//       mentía.
// ────────────────────────────────────────────────────────────────────

// Roles del world_bible que activan la auditoría. Cubren las máscaras
// típicas de cada género literario, no solo del thriller.
const TRAITOR_ROLE_PATTERNS = [
  // Thriller / espionaje
  "topo",
  "traidor",
  "traidora",
  "traicion",
  "falso aliado",
  "falsa aliada",
  "falso_aliado",
  "antagonista oculto",
  "antagonista_oculto",
  "complice oculto",
  "complice_oculto",
  "infiltrado",
  "infiltrada",
  "doble agente",
  "doble_agente",
  "aliado trai",
  "topo en",
  "mole",
  // Genérico universal — identidad oculta / secreto revelable
  "identidad oculta",
  "identidad_oculta",
  "doble identidad",
  "doble_identidad",
  "pasado oculto",
  "pasado_oculto",
  "secreto oscuro",
  "secreto_oscuro",
  "secreto familiar",
  "secreto_familiar",
  "secreto revelable",
  "secreto_revelable",
  "personaje con secreto",
  "personaje_con_secreto",
  "mascara",
  "enmascarado",
  "enmascarada",
  "antagonista enmascarado",
  "antagonista_enmascarado",
  // Romance / drama relacional
  "amante secreto",
  "amante_secreto",
  "amante oculto",
  "amante_oculto",
  "pretendiente falso",
  "rival oculto",
  "rival_oculto",
  // Fantasía / aventura / mitología
  "mentor falso",
  "mentor_falso",
  "mentor traidor",
  "mentor_traidor",
  "elegido falso",
  "falso elegido",
  "falso_elegido",
  "villano enmascarado",
  "villano_enmascarado",
  "profeta falso",
  // Drama familiar / literaria
  "hijo secreto",
  "hija secreta",
  "padre biologico oculto",
  "madre biologica oculta",
  "hermano oculto",
  "hermana oculta",
  "heredero oculto",
];

// Detección de reveal mediante PATRONES COPULARES/ACCIONALES que vinculan
// EXPLÍCITAMENTE al personaje con la traición. Sustituye la lógica anterior
// de proximidad + keyword suelta, que producía falsos positivos en frases
// como "Cifuentes sospecha del topo en aduanas" (el personaje aparece junto
// a "topo" pero NO se está revelando que él lo sea).
//
// Cada patrón asume que el nombre del traidor ya está normalizado (sin
// tildes, minúsculas) y será sustituido en {NAME}. Marcadores de palabra
// (\b) garantizan que "ana" no encaje en "anabel".
const REVEAL_PATTERN_TEMPLATES: string[] = [
  // === Thriller / espionaje ===
  // "<nombre> es/era/fue/resulta(ba) ser/se revela/se descubre [el] topo/traidor/infiltrad*/complice/doble agente/mole"
  "\\b{NAME}\\b[^.;]{0,40}\\b(es|era|fue|resulta\\s+ser|resultaba\\s+ser|se\\s+revela|se\\s+descubre|admite\\s+ser|confiesa\\s+ser|result[oó]\\s+ser)\\b[^.;]{0,40}\\b(el|la|un|una)?\\s*(topo|traidor|traidora|infiltrad[oa]|c[oó]mplice|doble\\s+agente|mole|falso\\s+aliado|falsa\\s+aliada)\\b",
  // "<nombre> traiciona / traicionaba / traicionó / nos traiciona"
  "\\b{NAME}\\b[^.;]{0,30}\\b(traiciona|traicionaba|traicion[oó]|ha\\s+traicionado|hab[ií]a\\s+traicionado)\\b",
  // "<nombre> (trabaja|trabajaba|reporta|reportaba|filtra|filtraba|responde) (a|para) <X>"
  "\\b{NAME}\\b[^.;]{0,30}\\b(trabaja|trabajaba|reporta|reportaba|filtra|filtraba|responde|respond[ií]a|sirve|serv[ií]a)\\b[^.;]{0,15}\\b(a|para|ante)\\b",
  // "<nombre> está/estaba/lleva vendido/comprado/infiltrado"
  "\\b{NAME}\\b[^.;]{0,25}\\b(est[aá]|estaba|lleva|llevaba)\\b[^.;]{0,20}\\b(vendid[oa]|comprad[oa]|infiltrad[oa])\\b",
  // "<nombre> encubre/encubría / cubre/cubría / protege/protegía <X>"
  "\\b{NAME}\\b[^.;]{0,25}\\b(encubre|encubr[ií]a|cubre|cubr[ií]a|protege|proteg[ií]a)\\b\\s+a\\b",
  // Forma invertida: "el topo/traidor [...] es/era/resulta ser <nombre>"
  "\\b(el|la|un|una)\\s+(topo|traidor|traidora|infiltrad[oa]|c[oó]mplice|doble\\s+agente|mole|falso\\s+aliado|falsa\\s+aliada)\\b[^.;]{0,40}\\b(es|era|fue|result[oó]\\s+ser|resulta\\s+ser|se\\s+revela\\s+como|se\\s+descubre\\s+como)\\b[^.;]{0,30}\\b{NAME}\\b",
  // "confiesa/admite/revela que <nombre> es/era/trabaja/traiciona..."
  "\\b(confiesa|confes[oó]|admite|admiti[oó]|revela|revel[oó]|descubre|descubri[oó])\\b[^.;]{0,30}\\bque\\b[^.;]{0,30}\\b{NAME}\\b",
  // "doble juego / doble vida / doble cara / dos caras de <nombre>"
  "\\b(doble\\s+(juego|vida|cara|moral)|dos\\s+caras)\\b[^.;]{0,30}\\b{NAME}\\b",
  "\\b{NAME}\\b[^.;]{0,30}\\b(doble\\s+(juego|vida|cara|moral)|dos\\s+caras)\\b",

  // === Universal: identidad oculta / falsa identidad (cualquier género) ===
  // "<nombre> no es quien dice ser / no es realmente / no es lo que parece"
  "\\b{NAME}\\b[^.;]{0,20}\\bno\\s+es\\b[^.;]{0,30}\\b(quien\\s+dice|realmente|lo\\s+que\\s+parece|qui[eé]n\\s+(creemos|creiamos|parec[ií]a))\\b",
  // "<nombre> oculta(ba)? / esconde(ía)? su (verdadera|verdadero) (identidad|pasado|origen|nombre|naturaleza|intencion|intención)"
  "\\b{NAME}\\b[^.;]{0,30}\\b(oculta|ocultaba|ocult[oó]|escond[ií]a|esconde|escond[ií]o)\\b[^.;]{0,25}\\b(su|una)\\b[^.;]{0,20}\\b(verdader[oa]|aut[eé]ntic[oa]|real)?\\s*(identidad|pasado|origen|nombre|naturaleza|intenci[oó]n|prop[oó]sito)\\b",
  // "<nombre> miente/mentía/mintió/engaña SOBRE su identidad/pasado/nombre/amor/sentimientos/lealtad"
  // Endurecido: NO basta con "{NAME} miente" suelto (ocurre en interrogatorios
  // ordinarios); exigimos preposición + sustantivo de identidad/relación.
  "\\b{NAME}\\b[^.;]{0,30}\\b(miente|ment[ií]a|minti[oó]|ha\\s+mentido|hab[ií]a\\s+mentido|enga[nñ]a|enga[nñ]aba|enga[nñ][oó])\\b[^.;]{0,25}\\b(sobre|acerca\\s+de|respecto\\s+a)\\b[^.;]{0,25}\\b(su|todo|todos|nuestro)?\\s*(identidad|pasado|nombre|origen|naturaleza|amor|sentimientos|intenci[oó]n|lealtad|matrimonio|familia)\\b",
  // "<nombre> es en realidad / en verdad <X>"
  "\\b{NAME}\\b[^.;]{0,25}\\bes\\b[^.;]{0,15}\\b(en\\s+realidad|en\\s+verdad|verdaderamente)\\b",
  // "se descubre/sabe/revela que <nombre> [verbo de identidad/lealtad/secreto]"
  // Endurecido: además del verbo "se descubre que <NAME>" exigimos un verbo
  // o sustantivo de cambio-de-modelo cerca (es/era/sirve/oculta/traiciona/
  // miente/etc.) para no marcar suspicacias rutinarias de interrogatorio.
  "\\b(se\\s+(descubre|sabe|revela|conoce|averigua|sab[ií]a|descubri[oó]|revel[oó]))\\b[^.;]{0,30}\\bque\\b[^.;]{0,30}\\b{NAME}\\b[^.;]{0,40}\\b(es|era|fue|sirve|sirvi[oó]|serv[ií]a|oculta|ocultaba|ocult[oó]|miente|ment[ií]a|minti[oó]|traiciona|traicion[oó]|trabaja|trabajaba|no\\s+es)\\b",

  // === Romance / drama relacional ===
  // "<nombre> nunca (la|lo) am[oó] / amaba / sentía nada / fingía amor"
  "\\b{NAME}\\b[^.;]{0,25}\\b(nunca|jamas|jam[aá]s)\\b[^.;]{0,25}\\b(am[oó]|amaba|quer[ií]a|sinti[oó]|sent[ií]a)\\b",
  "\\b{NAME}\\b[^.;]{0,25}\\b(fing[ií]a|simulaba|aparentaba)\\b[^.;]{0,25}\\b(amor|cariño|sentimientos|inter[eé]s|querer(la|lo)?)\\b",
  // "<nombre> usa(ba) / manipula(ba) / se aprovecha(ba) (de)"
  "\\b{NAME}\\b[^.;]{0,25}\\b(usaba|us[oó]|usa|manipula|manipulaba|manipul[oó]|se\\s+aprovech(a|aba|[oó]))\\b",
  // "<nombre> sigue casad[oa] / tiene otra (familia|relacion) / amante"
  "\\b{NAME}\\b[^.;]{0,30}\\b(sigue|estaba|est[aá])\\b[^.;]{0,15}\\b(casad[oa]|comprometid[oa]|prometid[oa])\\b",
  "\\b{NAME}\\b[^.;]{0,30}\\btiene\\b[^.;]{0,15}\\b(otra|otro)\\b[^.;]{0,20}\\b(familia|relaci[oó]n|esposa|marido|amante|hijo|hija)\\b",

  // === Fantasía / mitología / aventura ===
  // "<nombre> es (el verdadero villano|el verdadero antagonista|la oscuridad|el mal)"
  "\\b{NAME}\\b[^.;]{0,25}\\bes\\b[^.;]{0,25}\\b(el|la)\\s+(verdader[oa])\\s+(villano|antagonista|enemigo|amenaza|oscuridad|mal)\\b",
  // "el (verdadero|verdadera) (heredero|elegido|profeta|rey|reina) es <nombre>"
  "\\b(el|la)\\s+(verdader[oa]|aut[eé]ntic[oa])\\s+(heredero|elegido|elegida|profeta|profetisa|rey|reina|salvador|salvadora)\\b[^.;]{0,30}\\bes\\b[^.;]{0,20}\\b{NAME}\\b",
  // "<nombre> sirve/sirvió/serv[ií]a (al|a la) (oscuridad|sombra|enemigo|villano|orden negra)"
  "\\b{NAME}\\b[^.;]{0,25}\\b(sirve|sirvi[oó]|serv[ií]a)\\b[^.;]{0,20}\\b(al?|a\\s+la)\\b[^.;]{0,25}\\b(oscuridad|sombra|enemigo|villano|culto|orden\\s+(negra|oscura)|reino\\s+(oscuro|prohibido))\\b",
  // "<nombre> rompe el juramento / pacto / lealtad"
  "\\b{NAME}\\b[^.;]{0,25}\\b(rompe|rompi[oó]|romp[ií]a|quebr[oó])\\b[^.;]{0,15}\\b(su|el|la)\\b[^.;]{0,15}\\b(juramento|pacto|voto|lealtad|alianza)\\b",

  // === Drama familiar / literaria ===
  // "<nombre> es (el|la) (verdader[oa])? (padre|madre|hijo|hija|hermano|hermana) (de|biolog[ií]c[oa])"
  "\\b{NAME}\\b[^.;]{0,25}\\bes\\b[^.;]{0,25}\\b(el|la)\\s+(verdader[oa]|aut[eé]ntic[oa]|biol[oó]gic[oa])?\\s*(padre|madre|hijo|hija|hermano|hermana|abuelo|abuela|t[ií]o|t[ií]a)\\b",
  "\\b(el|la)\\s+(verdader[oa]|aut[eé]ntic[oa]|biol[oó]gic[oa])\\s+(padre|madre|hijo|hija|hermano|hermana)\\b[^.;]{0,30}\\bes\\b[^.;]{0,20}\\b{NAME}\\b",
];

// Keywords aceptadas dentro de `hecho_revelado` (campo declarativo y corto
// de revelaciones_dosificadas — el Arquitecto declara una sola idea). Aquí
// SÍ es seguro usar la lista de palabras clave porque el campo no contiene
// frases de sospecha sino la revelación misma.
const HECHO_REVEAL_KEYWORDS = [
  // Thriller / espionaje
  "traici",
  "topo",
  "infiltrad",
  "doble juego",
  "doble agente",
  "doble vida",
  "doble cara",
  "trabaja para",
  "trabajaba para",
  "reporta a",
  "reportaba a",
  "vendid",
  "comprad",
  "encubr",
  "filtra",
  "es complice",
  "era complice",
  "es el topo",
  "es un topo",
  "es la topo",
  "falso aliado",
  "falsa aliada",
  // Universal — identidad oculta (tokens ASCII sin acentos: el campo
  // ya está pasado por stripAccents antes de comparar).
  "identidad oculta",
  "verdadera identidad",
  "verdadero nombre",
  "pasado oculto",
  "secreto familiar",
  "no es quien",
  "no es realmente",
  "no es lo que parece",
  "miente",
  "mentia",
  "mintio",
  "engana",
  "enganaba",
  "engano",
  "en realidad es",
  "en verdad es",
  "mascara",
  // Romance / drama
  "amante secreto",
  "amante oculto",
  "nunca am",
  "fingia amor",
  "sigue casad",
  "otra familia",
  "otra relacion",
  // Fantasía / mitología
  "verdadero villano",
  "verdadero antagonista",
  "verdadero heredero",
  "verdadero elegido",
  "falso elegido",
  "sirve al",
  "sirve a la",
  "rompe el juramento",
  "rompio el juramento",
  "rompe el pacto",
  // Familiar / literaria
  "hijo secreto",
  "hija secreta",
  "padre biolog",
  "madre biolog",
  "hermano oculto",
  "hermana oculta",
  "heredero oculto",
];

function buildRevealRegexes(nameTokens: string[]): RegExp[] {
  // Construye un patrón de nombre = alternativa de los tokens del nombre real
  // (cualquiera de ellos basta — apellido suele ser suficiente). Cada token
  // queda anclado con \b en la plantilla.
  if (nameTokens.length === 0) return [];
  const namePat = "(?:" + nameTokens.map((t) => t.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")).join("|") + ")";
  return REVEAL_PATTERN_TEMPLATES.map(
    (tmpl) => new RegExp(tmpl.replace(/\{NAME\}/g, namePat), "i")
  );
}

function auditFalsoAliado(
  escaleta: any[],
  worldBible: any
): { problemas: StructuralAuditProblem[]; coverage: number } {
  const { all, total } = getActSlices(escaleta);
  const problemas: StructuralAuditProblem[] = [];
  if (total === 0) return { problemas, coverage: 1 };

  const personajes: any[] =
    worldBible?.personajes || worldBible?.world_bible?.personajes || [];
  const stripAccents = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  const traidores = personajes
    .map((p: any) => {
      const rol = stripAccents(String(p.rol || p.role || ""));
      const isTraitor = TRAITOR_ROLE_PATTERNS.some((pat) => rol.includes(pat));
      if (!isTraitor) return null;
      const nombre = String(p.nombre || p.name || "").trim();
      if (!nombre) return null;
      const normFull = stripAccents(nombre).replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
      const tokens = normFull.split(/\s+/).filter((t) => t.length >= 4);
      return { nombre, rol, tokens };
    })
    .filter(Boolean) as { nombre: string; rol: string; tokens: string[] }[];

  if (traidores.length === 0) return { problemas, coverage: 1 };

  let auditados = 0;
  let conformes = 0;

  // Precompute normalized corpora per cap.
  const corpusByCap: Record<number, string> = {};
  for (const c of all) {
    corpusByCap[capNum(c)] = stripAccents(capCorpus(c));
  }

  const minRevealRatio = 0.6;
  const minRevealCap = Math.ceil(total * minRevealRatio);

  for (const tr of traidores) {
    auditados += 1;
    // Detect reveal cap: usamos patrones copulares/accionales que ligan
    // EXPLÍCITAMENTE al personaje con la traición (ver
    // REVEAL_PATTERN_TEMPLATES). Reemplaza la heurística previa de
    // proximidad keyword + nombre, que disparaba en "X sospecha del topo".
    const revealRegexes = buildRevealRegexes(tr.tokens);
    const corpusHasExplicitReveal = (corpus: string): boolean => {
      if (!corpus) return false;
      return revealRegexes.some((re) => re.test(corpus));
    };
    let revealCap: number | null = null;
    for (const c of all) {
      const corpus = corpusByCap[capNum(c)] || "";
      const hasReveal = corpusHasExplicitReveal(corpus);
      // Refuerzo: también miramos revelaciones_dosificadas explícitas
      // (donde el "hecho_revelado" ya está acotado a una sola idea).
      let revDosMatch = false;
      const revs: any[] = Array.isArray(c.revelaciones_dosificadas)
        ? c.revelaciones_dosificadas
        : [];
      for (const r of revs) {
        const hecho = stripAccents(String(r?.hecho_revelado || ""));
        const revealer = stripAccents(String(r?.personaje_revelador || ""));
        const refersToTraitor =
          tr.tokens.some((t) => hecho.includes(t) || revealer.includes(t));
        if (refersToTraitor && HECHO_REVEAL_KEYWORDS.some((k) => hecho.includes(k))) {
          revDosMatch = true;
          break;
        }
      }
      if (hasReveal || revDosMatch) {
        revealCap = capNum(c);
        break;
      }
    }

    if (revealCap === null) {
      // No detectamos reveal en la escaleta. Es posible que el Arquitecto no
      // haya etiquetado el giro; pedimos cobertura explícita.
      problemas.push({
        area: "falso_aliado",
        tipo: "reveal_no_declarado",
        severidad: "media",
        capitulos: [],
        descripcion: `El personaje "${tr.nombre}" tiene rol "${tr.rol}" en el world_bible pero el auditor no encuentra ningún capítulo donde se revele su traición de forma explícita (ni en texto libre ni en "revelaciones_dosificadas"). El lector no recibe el giro.`,
        sugerencia: `Identifica el capítulo donde "${tr.nombre}" se descubre como traidor y añade una entrada en "revelaciones_dosificadas" con hecho_revelado mencionando explícitamente al personaje y palabras clave del giro (traición, topo, infiltrado, doble juego, conspira). Coloca ese cap en el último 40% de la novela (cap ≥ ${minRevealCap} de ${total}) y dosifica la siembra de ambigüedad en caps previos.`,
      });
      continue;
    }

    // Rule A: reveal demasiado pronto.
    if (revealCap < minRevealCap) {
      problemas.push({
        area: "falso_aliado",
        tipo: "reveal_temprano",
        severidad: "alta",
        capitulos: [revealCap],
        descripcion: `La traición de "${tr.nombre}" se revela en el cap ${revealCap} de ${total} (${Math.round((revealCap / total) * 100)}% de la novela). El umbral es ≥${Math.round(minRevealRatio * 100)}% (cap ${minRevealCap}). Patrón "Cifuentes obvio desde cap 2": el lector lo ve venir y el giro pierde fuerza.`,
        sugerencia: `Retrasa la revelación de la traición de "${tr.nombre}" al menos al cap ${minRevealCap}. En los caps anteriores mantén la AMBIGÜEDAD: el personaje puede parecer hostil, presionar al protagonista o tomar decisiones cuestionables, pero el lector NO debe poder afirmar "este es el topo". Si quieres que el reveal sea más temprano por razones de trama, cambia su rol en el world_bible (no es "topo" sino "antagonista declarado") y elimina la ambigüedad.`,
      });
      continue;
    }

    // Rule B: humanización previa (al menos 1 cap antes con forma humanizante
    // donde aparezca el personaje).
    const priorCaps = all.filter((c: any) => {
      const n = capNum(c);
      return n > 0 && n < (revealCap as number);
    });
    const tienesHumanizacion = priorCaps.some((c: any) => {
      const corpus = corpusByCap[capNum(c)] || "";
      const mentionsName = tr.tokens.some((t) => corpus.includes(t));
      if (!mentionsName) return false;
      const forma = String(c.forma_dominante || "").toLowerCase();
      const categoria = String(c.categoria_info_nueva || "").toLowerCase();
      return (
        forma === "introspeccion" ||
        forma === "pivote_relacional" ||
        forma === "escena_romantica" ||
        forma === "recuerdo_flashback" ||
        categoria === "vinculo_emocional" ||
        categoria === "confesion_emocional" ||
        categoria === "memoria_revelada"
      );
    });
    if (!tienesHumanizacion) {
      problemas.push({
        area: "falso_aliado",
        tipo: "sin_humanizacion_previa",
        severidad: "media",
        capitulos: [revealCap],
        descripcion: `El secreto/identidad oculta de "${tr.nombre}" se revela en el cap ${revealCap} pero ningún capítulo anterior contiene una escena de humanización del personaje (forma_dominante "introspeccion", "pivote_relacional", "escena_romantica" o "recuerdo_flashback", o categoria_info_nueva "vinculo_emocional", "confesion_emocional" o "memoria_revelada" con "${tr.nombre}" en escena). El giro funciona pero NO DUELE: el lector no había construido vínculo con el personaje. (Aplica a cualquier género: traidor de thriller, amante manipulador de romance, mentor falso de fantasía, pariente con secreto familiar en drama, etc.)`,
        sugerencia: `Antes del cap ${revealCap}, añade al menos 1 capítulo donde "${tr.nombre}" tenga una escena que lo humanice según el género: thriller — un momento a solas en su despacho mirando fotos, una llamada cansada a un familiar; romance — una confesión vulnerable al protagonista, un gesto de ternura aparentemente sincero; fantasía — un recuerdo de su juventud antes de la oscuridad, una duda ante el camino que sigue; literaria/drama — un flashback con tono cálido, una memoria compartida con el protagonista. Marca ese cap con forma_dominante "pivote_relacional", "introspeccion", "escena_romantica" o "recuerdo_flashback", y categoria_info_nueva "vinculo_emocional", "confesion_emocional" o "memoria_revelada".`,
      });
      continue;
    }

    conformes += 1;
  }

  const coverage = auditados > 0 ? conformes / auditados : 1;
  return { problemas, coverage };
}

// ────────────────────────────────────────────────────────────────────
// [Fix97-A] Escalada de apuestas en el acto 2.
// Catálogo APUESTA_VALORES (baja<media<alta<critica). Dos comprobaciones
// sobre los capítulos regulares (numero >= 1):
//   (a) Cobertura del campo "apuesta_dramatica". Si <50% del total se
//       reclama como cobertura insuficiente (severidad media).
//   (b) En el acto 2 (~50% central de la novela), buscar secuencias de
//       3+ caps consecutivos con rango IGUAL o DECRECIENTE: el lector
//       percibe un bucle de presión sin escalada (queja convergente de
//       Holístico y Beta sobre "El eco del asfalto" caps 8-22).
//   (c) Pico mínimo: en el acto 2 debe existir al menos UN capítulo con
//       apuesta "alta" o "critica". Si todo el acto 2 es baja/media, el
//       acto medio es plano (no hay punto de no retorno antes del clímax).
// ────────────────────────────────────────────────────────────────────
function auditEscaladaActo2(
  escaleta: any[]
): { problemas: StructuralAuditProblem[]; coverage: number } {
  const { all, act2, total } = getActSlices(escaleta);
  const problemas: StructuralAuditProblem[] = [];
  if (total === 0) return { problemas, coverage: 1 };

  const rankOf = (c: any): number | null => {
    const v = String(c?.apuesta_dramatica || "").toLowerCase().trim();
    if (!v) return null;
    const r = APUESTA_RANK[v];
    return typeof r === "number" ? r : null;
  };

  const withApuesta = all.filter((c: any) => rankOf(c) !== null);
  const coverage = total > 0 ? withApuesta.length / total : 0;

  if (total > 0 && coverage < 0.5) {
    const ausentes = all.filter((c: any) => rankOf(c) === null).map(capNum);
    problemas.push({
      area: "escalada_acto2",
      tipo: "apuesta_dramatica_ausente",
      severidad: "media",
      capitulos: ausentes,
      descripcion: `Solo ${Math.round(coverage * 100)}% de los capítulos declaran "apuesta_dramatica". Sin este campo no se puede garantizar escalada en el acto 2.`,
      sugerencia: `Asigna a cada capítulo regular un valor de "apuesta_dramatica" del catálogo: ${APUESTA_VALORES.join(", ")}. Es el COSTE que pagaría el protagonista si fracasa AQUÍ: "baja" = inconveniencia (perder tiempo, hacer enfadar a un superior); "media" = pérdida concreta (un aliado, una pista, una ventaja táctica); "alta" = pérdida irreversible o riesgo vital (cárcel, muerte de un secundario, exposición pública); "critica" = punto sin retorno (jugarse la vida, la identidad o el arco entero). El acto 2 debe ESCALAR: capítulos consecutivos con la misma apuesta producen sensación de bucle.`,
    });
  }

  if (act2.length < 3) {
    return { problemas, coverage };
  }

  // (b) Bucle: secuencias de ≥3 caps consecutivos no crecientes.
  // Recorremos act2; agrupamos cada vez que rank[i+1] <= rank[i].
  const ranked = act2.map((c: any) => ({ cap: capNum(c), r: rankOf(c) }));
  let i = 0;
  const bucles: number[][] = [];
  while (i < ranked.length) {
    if (ranked[i].r === null) {
      i++;
      continue;
    }
    let j = i;
    const runCaps: number[] = [ranked[i].cap];
    while (j + 1 < ranked.length && ranked[j + 1].r !== null && (ranked[j + 1].r as number) <= (ranked[j].r as number)) {
      runCaps.push(ranked[j + 1].cap);
      j++;
    }
    if (runCaps.length >= 3) bucles.push(runCaps);
    i = j + 1;
  }
  for (const caps of bucles) {
    problemas.push({
      area: "escalada_acto2",
      tipo: "bucle_sin_escalada",
      severidad: "media",
      capitulos: caps,
      descripcion: `Caps ${caps.join(", ")} del acto 2 tienen "apuesta_dramatica" IGUAL o DECRECIENTE (${caps.length} caps consecutivos). El lector percibe un bucle de presión sin escalada: "ya entendí en el cap anterior que el protagonista está aislado / acorralado / sin pistas; no necesito leerlo otra vez".`,
      sugerencia: `Sube la apuesta de al menos uno de los caps del medio del bucle: convierte una "media" en "alta" añadiendo una pérdida irreversible (un aliado herido, una identidad expuesta, una orden de detención), o una "alta" en "critica" añadiendo un punto sin retorno (el protagonista se la juega solo, queda inhabilitado, traiciona una norma propia). La regla universal: si dos caps consecutivos tienen la misma apuesta, el tercero DEBE subir un escalón. No basta con cambiar la forma_dominante; tiene que doler MÁS.`,
    });
  }

  // (c) Pico mínimo en acto 2.
  const declaradosAct2 = ranked.filter((x) => x.r !== null);
  if (declaradosAct2.length >= 4) {
    const maxRank = declaradosAct2.reduce((m, x) => Math.max(m, x.r as number), 0);
    if (maxRank < 3) {
      problemas.push({
        area: "escalada_acto2",
        tipo: "acto2_plano",
        severidad: "media",
        capitulos: declaradosAct2.map((x) => x.cap),
        descripcion: `Todo el acto 2 (${declaradosAct2.length} caps con apuesta declarada) se mantiene en niveles "baja" o "media". No existe ningún capítulo "alta" o "critica" antes del acto 3: el lector llega al clímax sin haber sentido un punto de no retorno.`,
        sugerencia: `Identifica el cap más cercano al centro del acto 2 que pueda absorber un punto de no retorno y súbelo a "alta" o "critica": una pérdida que el protagonista ya no podrá recuperar (muerte de un aliado, ruptura definitiva, decisión que lo coloca al otro lado de la ley). El acto 2 sin pico = acto 2 plano, queja recurrente del Beta.`,
      });
    }
  }

  return { problemas, coverage };
}

// ────────────────────────────────────────────────────────────────────
// [Fix97-B] Deus ex machina: informante / portador de prueba clave sin
// siembra previa. Para cada "revelaciones_dosificadas" con dificultad
// "alto" en el último 25% de la novela (cap >= 0.75 * total), si el
// "personaje_revelador" NO es el protagonista, verificamos que el
// personaje haya aparecido en escena en ≥2 capítulos anteriores
// (elenco_presente, personajes_presentes, o mención textual en el
// objetivo_narrativo / informacion_nueva / beats / sinopsis). Simétrico
// a Fix94: Fix94 audita al traidor; éste audita al salvador.
// Severidad alta si 0 apariciones previas (deus ex puro); severidad
// media si 1 aparición (siembra mínima pero insuficiente).
// ────────────────────────────────────────────────────────────────────
function auditDeusExMachina(
  escaleta: any[],
  worldBible: any
): { problemas: StructuralAuditProblem[]; coverage: number } {
  const { all, total } = getActSlices(escaleta);
  const problemas: StructuralAuditProblem[] = [];
  if (total === 0) return { problemas, coverage: 1 };

  const stripAccents = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  // Identificamos los protagonistas (cualquier personaje cuyo rol contenga
  // "protagonista" o "protagonist"). Sus revelaciones quedan excluidas:
  // son introspección/descubrimiento propio, no deus ex.
  // Identidad robusta (anti-falso-negativo): comparamos por nombre normalizado
  // COMPLETO o por subconjunto estricto de tokens (todos los tokens del
  // revealer deben ser parte del nombre del protagonista). Así un secundario
  // que solo comparta apellido con el protagonista (familia, mismo apellido
  // común) NO queda excluido del auditor.
  const personajes: any[] =
    worldBible?.personajes || worldBible?.world_bible?.personajes || [];
  const protagonistas: { fullNorm: string; tokens: Set<string> }[] = [];
  for (const p of personajes) {
    const rol = stripAccents(String(p?.rol || p?.role || ""));
    if (rol.includes("protagonista") || rol.includes("protagonist")) {
      const fullNorm = stripAccents(String(p?.nombre || p?.name || ""))
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!fullNorm) continue;
      const tokens = new Set(
        fullNorm.split(/\s+/).filter((t) => t.length >= 4)
      );
      protagonistas.push({ fullNorm, tokens });
    }
  }
  const isProtagonistRevealer = (
    revFull: string,
    revTokens: string[]
  ): boolean => {
    for (const prot of protagonistas) {
      if (revFull && revFull === prot.fullNorm) return true;
      // Subconjunto estricto: todos los tokens del revealer (>=4 chars) están
      // en el set del protagonista. Esto cubre "Zubiri" == "Inspector Zubiri"
      // (revealer 1 token, todos en prota) pero NO "Aitor Zubiri" (hijo del
      // prota) cuando el prota es "Mikel Zubiri": revealer tiene "aitor" que
      // no está en el prota.
      if (revTokens.length > 0 && revTokens.every((t) => prot.tokens.has(t))) {
        return true;
      }
    }
    return false;
  };

  const minRevealCap = Math.ceil(total * 0.75);

  // Precompute corpora + elenco para cada cap.
  const elencoByCap: Record<number, string[]> = {};
  const corpusByCap: Record<number, string> = {};
  for (const c of all) {
    const n = capNum(c);
    const elenco: string[] = [];
    const pushList = (arr: any) => {
      if (Array.isArray(arr)) for (const x of arr) if (typeof x === "string") elenco.push(stripAccents(x));
    };
    pushList(c?.elenco_presente);
    pushList(c?.personajes_presentes);
    elencoByCap[n] = elenco;
    corpusByCap[n] = stripAccents(capCorpus(c));
  }

  let auditados = 0;
  let conformes = 0;

  for (const c of all) {
    const n = capNum(c);
    if (n < minRevealCap) continue;
    const revs: any[] = Array.isArray(c.revelaciones_dosificadas)
      ? c.revelaciones_dosificadas
      : [];
    for (const r of revs) {
      const dif = String(r?.dificultad || "").toLowerCase().trim();
      if (dif !== "alto") continue;
      const revealerRaw = String(r?.personaje_revelador || "").trim();
      if (!revealerRaw) continue;
      const revealerNorm = stripAccents(revealerRaw)
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const revealerTokens = revealerNorm.split(/\s+/).filter((t) => t.length >= 4);
      if (revealerTokens.length === 0) continue;

      // Excluir protagonista (auto-revelación). Identidad robusta: nombre
      // completo normalizado o subconjunto estricto de tokens. Evita falsos
      // negativos cuando un secundario comparte apellido con el protagonista.
      if (isProtagonistRevealer(revealerNorm, revealerTokens)) continue;

      auditados += 1;

      // Para detectar apariciones, descartamos tokens que también pertenecen
      // a algún protagonista. Si revealer es "Aitor Zubiri" y el prota es
      // "Mikel Zubiri", el token "zubiri" produciría falsos positivos en
      // cada cap donde aparece el prota; los tokens distintivos del revealer
      // son los que NO comparte con ningún protagonista (aquí: "aitor").
      const protaTokenUnion = new Set<string>();
      for (const prot of protagonistas) for (const t of prot.tokens) protaTokenUnion.add(t);
      const distinctTokens = revealerTokens.filter((t) => !protaTokenUnion.has(t));
      // Si no quedan tokens distintivos, el revealer es indistinguible del
      // prota a efectos textuales: lo tratamos como auto-revelación.
      if (distinctTokens.length === 0) continue;

      // Contar apariciones en caps regulares con número 1..n-1.
      // (Prólogo cap 0 / epílogo cap -1 quedan excluidos por getActSlices.)
      let apariciones = 0;
      const capsConAparicion: number[] = [];
      for (const prev of all) {
        const pn = capNum(prev);
        if (pn >= n) continue;
        const elenco = elencoByCap[pn] || [];
        const corpus = corpusByCap[pn] || "";
        const inElenco = elenco.some((e) =>
          distinctTokens.some((t) => e.includes(t))
        );
        const tokenRegex = distinctTokens.map(
          (t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`)
        );
        const inCorpus = tokenRegex.some((re) => re.test(corpus));
        if (inElenco || inCorpus) {
          apariciones += 1;
          capsConAparicion.push(pn);
        }
      }

      if (apariciones === 0) {
        problemas.push({
          area: "deus_ex_machina",
          tipo: "revelador_sin_siembra",
          severidad: "alta",
          capitulos: [n],
          descripcion: `El personaje "${revealerRaw}" entrega una revelación de dificultad "alto" en el cap ${n} (${Math.round((n / total) * 100)}% de la novela) pero NO aparece en ningún capítulo anterior — ni en elenco_presente, ni mencionado en objetivo_narrativo / informacion_nueva / beats. Para el lector aparece de la nada: deus ex machina puro (queja literal del Beta sobre Rentería en "El eco del asfalto" cap 32).`,
          sugerencia: `Inserta al menos 2 apariciones previas de "${revealerRaw}" antes del cap ${n}. Las apariciones deben tener PESO: un cap donde el personaje sea introducido como secundario menor (con beat propio o diálogo, no solo nombrado de pasada), y un segundo cap donde se sugiera que sabe algo o tiene acceso a algo. Si la trama no admite sembrarlo, redistribuye la revelación: que la información llegue por una vía YA SEMBRADA (un personaje recurrente, un documento ya conocido) en lugar de un portador nuevo. Alternativamente, baja la dificultad a "medio" si la revelación es menos crítica de lo declarado.`,
        });
        continue;
      }

      if (apariciones === 1) {
        problemas.push({
          area: "deus_ex_machina",
          tipo: "revelador_siembra_minima",
          severidad: "media",
          capitulos: [n],
          descripcion: `El personaje "${revealerRaw}" entrega una revelación "alto" en el cap ${n} pero solo aparece en 1 capítulo anterior (cap ${capsConAparicion.join(", ")}). El lector apenas lo recuerda: la revelación funciona en lo formal pero no se siente "ganada" por la trama.`,
          sugerencia: `Añade al menos 1 cap más entre los caps ${capsConAparicion[0]} y ${n} donde "${revealerRaw}" tenga presencia real (un beat propio o mención en objetivo_narrativo). Idealmente con una pista de que conoce el material que después aporta, para que su entrega en el cap ${n} sea cosecha y no comodín.`,
        });
        continue;
      }

      conformes += 1;
    }
  }

  const coverage = auditados > 0 ? conformes / auditados : 1;
  return { problemas, coverage };
}

// ────────────────────────────────────────────────────────────────────
// [Fix97-C] Trauma activo del protagonista. Si el world_bible declara
// que el protagonista tiene "trauma_oculto" / "herida_pasada" /
// "motivacion_oculta" / "secreto_personal" no vacío, exigimos que el
// primer 60% de la novela contenga ≥3 caps donde el protagonista esté
// presente y el capítulo sea de naturaleza introspectiva o
// memorialista: forma_dominante ∈ {introspeccion, recuerdo_flashback}
// O categoria_info_nueva ∈ {memoria_revelada, revelacion_personal,
// confesion_emocional, transformacion_personal}.
// Anti-patrón: prólogo planta trauma, silencio durante toda la novela,
// epílogo lo recupera (queja convergente de Holístico y Beta sobre
// Zubiri en "El eco del asfalto").
// ────────────────────────────────────────────────────────────────────
function auditTraumaProtagonista(
  escaleta: any[],
  worldBible: any
): { problemas: StructuralAuditProblem[]; coverage: number } {
  const { all, total } = getActSlices(escaleta);
  const problemas: StructuralAuditProblem[] = [];
  if (total === 0) return { problemas, coverage: 1 };

  const stripAccents = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  const personajes: any[] =
    worldBible?.personajes || worldBible?.world_bible?.personajes || [];
  const protagonistas = personajes.filter((p: any) => {
    const rol = stripAccents(String(p?.rol || p?.role || ""));
    return rol.includes("protagonista") || rol.includes("protagonist");
  });
  if (protagonistas.length === 0) return { problemas, coverage: 1 };

  const TRAUMA_FIELDS = [
    "trauma_oculto",
    "trauma",
    "herida_pasada",
    "herida",
    "motivacion_oculta",
    "secreto_personal",
    "secreto",
    "pasado_oculto",
  ];

  const isNonEmpty = (v: any): boolean => {
    if (!v) return false;
    if (typeof v === "string") return v.trim().length >= 10;
    if (Array.isArray(v)) return v.some((x) => isNonEmpty(x));
    if (typeof v === "object") return Object.values(v).some((x) => isNonEmpty(x));
    return false;
  };

  const traumaProtas = protagonistas
    .map((p: any) => {
      const tieneTrauma = TRAUMA_FIELDS.some((f) => isNonEmpty(p?.[f]));
      if (!tieneTrauma) return null;
      const nombre = String(p?.nombre || p?.name || "").trim();
      if (!nombre) return null;
      const norm = stripAccents(nombre)
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const tokens = norm.split(/\s+/).filter((t) => t.length >= 4);
      return { nombre, tokens };
    })
    .filter(Boolean) as { nombre: string; tokens: string[] }[];

  if (traumaProtas.length === 0) return { problemas, coverage: 1 };

  const FIRST_60_CUT = Math.ceil(total * 0.6);
  const FORMA_TRAUMA = new Set(["introspeccion", "recuerdo_flashback"]);
  const CAT_TRAUMA = new Set([
    "memoria_revelada",
    "revelacion_personal",
    "confesion_emocional",
    "transformacion_personal",
  ]);
  const MIN_TRAUMA_CAPS = 3;

  let auditados = 0;
  let conformes = 0;

  for (const prota of traumaProtas) {
    auditados += 1;
    const capsTrauma: number[] = [];
    for (const c of all) {
      const n = capNum(c);
      if (n < 1 || n > FIRST_60_CUT) continue;
      const elenco: string[] = [];
      const pushList = (arr: any) => {
        if (Array.isArray(arr))
          for (const x of arr) if (typeof x === "string") elenco.push(stripAccents(x));
      };
      pushList(c?.elenco_presente);
      pushList(c?.personajes_presentes);
      const corpus = stripAccents(capCorpus(c));
      const tokenRegex = prota.tokens.map(
        (t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`)
      );
      const inElenco = elenco.some((e) => prota.tokens.some((t) => e.includes(t)));
      const inCorpus = tokenRegex.some((re) => re.test(corpus));
      if (!inElenco && !inCorpus) continue;
      const forma = String(c?.forma_dominante || "").toLowerCase().trim();
      const cat = String(c?.categoria_info_nueva || "").toLowerCase().trim();
      if (FORMA_TRAUMA.has(forma) || CAT_TRAUMA.has(cat)) {
        capsTrauma.push(n);
      }
    }
    if (capsTrauma.length < MIN_TRAUMA_CAPS) {
      problemas.push({
        area: "trauma_protagonista",
        tipo: "trauma_sin_caps_activos",
        severidad: "media",
        capitulos: capsTrauma,
        descripcion: `El protagonista "${prota.nombre}" tiene un trauma / herida / secreto declarado en el world_bible, pero el primer 60% de la novela (caps 1 a ${FIRST_60_CUT} de ${total}) solo contiene ${capsTrauma.length} capítulo(s) donde el protagonista esté presente Y el capítulo sea introspectivo o memorialista. Mínimo exigido: ${MIN_TRAUMA_CAPS}. Anti-patrón: prólogo planta el trauma, cuerpo de la novela lo silencia, epílogo lo recupera. El lector percibe el trauma como apéndice, no como motor.`,
        sugerencia: `Añade al menos ${MIN_TRAUMA_CAPS - capsTrauma.length} cap(s) en el primer 60% de la novela donde "${prota.nombre}" reactive el trauma de forma activa. Usa una de estas marcas: forma_dominante = "introspeccion" (escena interior, sueño, monólogo donde el trauma se manifiesta) o "recuerdo_flashback" (salto al pasado que lo concretiza); o categoria_info_nueva = "memoria_revelada" / "revelacion_personal" / "confesion_emocional" / "transformacion_personal" (escena donde el trauma cambia una decisión del protagonista, una relación, un patrón de conducta). El trauma debe ser PALANCA, no decorado: cada cap de trauma activo debe alterar lo que el protagonista hace después.`,
      });
      continue;
    }
    conformes += 1;
  }

  const coverage = auditados > 0 ? conformes / auditados : 1;
  return { problemas, coverage };
}

// ────────────────────────────────────────────────────────────────────
// (9) [Fix142-A] Continuidad de arco de personaje SECUNDARIO.
// Ninguna dimensión previa vigilaba que un secundario al que la World Bible
// le declara un ARCO DE TRANSFORMACIÓN mantenga presencia a lo largo del
// libro. `auditArcoSecreto`/`auditFalsoAliado` solo cubren reveals de
// secreto/traidor; `auditTraumaProtagonista` solo cubre al protagonista.
// El defecto recurrente (caso "Leonor"): un secundario presentado como
// relevante en el acto 1 se evapora durante un tramo largo y reaparece tarde
// para un cierre no ganado, o nunca se desarrolla.
//
// Técnica: misma que `auditArcoSecreto` — tokens de nombre (≥4 chars) y
// presencia textual por capítulo (set de tokens del corpus, palabra
// completa). CONSERVADOR para evitar falsos positivos:
//   - Solo audita secundarios con `arco_transformacion` DECLARADO y NO
//     vacío (el contrato explícito de la WB de que ese personaje cambia).
//   - Excluye protagonista / antagonista / traidor (los cubren otras dims).
//   - Solo en novelas de ≥10 caps regulares (en libros cortos la señal de
//     "brecha" no es fiable).
// Compatible con SERIES: solo penaliza desapariciones DENTRO del volumen
// (presentado pronto y ausente del tramo final del MISMO libro). Un arco
// que continúa en el siguiente volumen mantiene presencia a lo largo de
// este y por tanto NO se marca.
// ────────────────────────────────────────────────────────────────────
const SECUNDARIO_EXCLUDE_ROLE_PATTERNS = [
  "protagonista",
  "protagonist",
  "narrador",
  "antagonista",
  "antagonist",
  "villano",
  "villana",
  "villan",
  "adversari",
  "enemigo",
  ...TRAITOR_ROLE_PATTERNS,
];

function arcTransformacionDeclarado(arc: any): boolean {
  if (!arc) return false;
  if (typeof arc === "string") return arc.trim().length >= 8;
  if (typeof arc === "object") {
    const partes = [
      arc.estado_inicial,
      arc.catalizador_cambio,
      arc.punto_crisis,
      arc.estado_final,
    ];
    const llenas = partes.filter(
      (v) => typeof v === "string" && v.trim().length >= 8
    ).length;
    // Exigimos al menos 2 campos sustanciales: un arco con solo el
    // estado_inicial relleno no es un contrato de transformación.
    return llenas >= 2;
  }
  return false;
}

function auditArcoSecundario(
  escaleta: any[],
  worldBible: any
): { problemas: StructuralAuditProblem[]; coverage: number } {
  const { all, total } = getActSlices(escaleta);
  const problemas: StructuralAuditProblem[] = [];
  // [Fix142-A] En libros cortos la heurística de brechas no es fiable.
  if (total < 10) return { problemas, coverage: 1 };

  const personajes: any[] =
    worldBible?.personajes || worldBible?.world_bible?.personajes || [];
  const stripAccents = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  const secundarios = personajes
    .map((p: any) => {
      const rol = stripAccents(String(p?.rol || p?.role || ""));
      if (SECUNDARIO_EXCLUDE_ROLE_PATTERNS.some((pat) => rol.includes(pat))) {
        return null;
      }
      if (!arcTransformacionDeclarado(p?.arco_transformacion)) return null;
      const nombre = String(p?.nombre || p?.name || "").trim();
      if (!nombre) return null;
      const normFull = stripAccents(nombre)
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const tokens = normFull
        .split(/\s+/)
        .filter((t) => t.length >= 4 && !STOPWORDS_ES.has(t));
      if (tokens.length === 0) return null;
      return { nombre, rol, tokens };
    })
    .filter(Boolean) as { nombre: string; rol: string; tokens: string[] }[];

  if (secundarios.length === 0) return { problemas, coverage: 1 };

  // Set de tokens (palabra completa) por capítulo, igual que auditArcoSecreto.
  const tokensByCap: Record<number, Set<string>> = {};
  const capNumsOrdenados: number[] = [];
  for (const c of all) {
    const n = capNum(c);
    capNumsOrdenados.push(n);
    const norm = capCorpus(c)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    tokensByCap[n] = new Set(norm.split(/\s+/).filter(Boolean));
  }

  const earlyCutoff = Math.ceil(total * 0.4);
  const finalStretchStart = Math.floor(total * 0.75);

  let auditados = 0;
  let conformes = 0;

  for (const sec of secundarios) {
    auditados += 1;
    const apariciones: number[] = [];
    for (const n of capNumsOrdenados) {
      const capTokens = tokensByCap[n];
      if (!capTokens || capTokens.size === 0) continue;
      if (sec.tokens.some((t) => capTokens.has(t))) apariciones.push(n);
    }

    if (apariciones.length === 0) {
      // Declara arco de transformación pero NO aparece en ningún capítulo.
      problemas.push({
        area: "arco_secundario",
        tipo: "personaje_con_arco_ausente",
        severidad: "media",
        capitulos: [],
        descripcion: `"${sec.nombre}" (rol "${sec.rol}") tiene un "arco_transformacion" declarado en la World Bible pero el auditor no lo encuentra mencionado en NINGÚN capítulo de la escaleta. Un arco prometido que nunca aparece es un hilo muerto o un nombre mal escrito en los capítulos.`,
        sugerencia: `Si "${sec.nombre}" es relevante, dale presencia: al menos 1 escena de presentación en el acto 1 y 2-3 escenas intermedias donde tome una decisión o se posicione, más una resolución de su arco. Si NO es relevante, quítale el "arco_transformacion" en la World Bible (un secundario sin arco no se audita aquí).`,
      });
      continue;
    }

    const firstApp = apariciones[0];
    const lastApp = apariciones[apariciones.length - 1];
    const introducedEarly = firstApp <= earlyCutoff;
    const reachesFinalStretch = lastApp >= finalStretchStart;

    // Brecha máxima entre apariciones consecutivas.
    let maxGap = 0;
    let gapDesde = firstApp;
    let gapHasta = firstApp;
    for (let i = 1; i < apariciones.length; i++) {
      const g = apariciones[i] - apariciones[i - 1];
      if (g > maxGap) {
        maxGap = g;
        gapDesde = apariciones[i - 1];
        gapHasta = apariciones[i];
      }
    }

    // (a) ARCO ABANDONADO: presentado pronto pero ausente del tramo final del
    // libro. El lector esperaba el pago del arco y el personaje se evaporó.
    if (introducedEarly && !reachesFinalStretch) {
      const gapToEnd = total - lastApp;
      // Severidad alta solo en un caso INEQUÍVOCO: hilo sustancial (≥4
      // apariciones tempranas) que desaparece todo el tercio final (≥40%).
      const strong =
        apariciones.length >= 4 && gapToEnd >= Math.floor(total * 0.4);
      problemas.push({
        area: "arco_secundario",
        tipo: "arco_secundario_abandonado",
        severidad: strong ? "alta" : "media",
        capitulos: [lastApp],
        descripcion: `"${sec.nombre}" (rol "${sec.rol}", con arco_transformacion declarado) aparece por última vez en el cap ${lastApp} de ${total} (${Math.round((lastApp / total) * 100)}%) tras presentarse pronto (cap ${firstApp}). Desaparece del tramo final del libro (a partir del cap ${finalStretchStart}) sin resolver su arco. Apariciones totales: ${apariciones.length} (caps ${apariciones.join(", ")}). Es el patrón "secundario abandonado": prometido como relevante y luego evaporado.`,
        sugerencia: `Reparte la presencia de "${sec.nombre}" hasta el final: añade 1-2 escenas en el último tercio (a partir del cap ${finalStretchStart}) donde el personaje tome una DECISIÓN concreta, se posicione ante el conflicto o reciba la consecuencia de su arco (estado_final declarado en la World Bible). Evita la reaparición fantasma de último capítulo: el cierre debe estar GANADO con escenas intermedias, no anunciado de golpe.`,
      });
      continue;
    }

    // (b) DESAPARICIÓN PROLONGADA: brecha enorme en mitad del libro (se
    // evapora y reaparece) sin escenas intermedias que mantengan el hilo.
    const gapUmbral = Math.max(5, Math.floor(total * 0.45));
    if (maxGap >= gapUmbral) {
      problemas.push({
        area: "arco_secundario",
        tipo: "desaparicion_prolongada",
        severidad: "media",
        capitulos: [gapDesde, gapHasta],
        descripcion: `"${sec.nombre}" (rol "${sec.rol}", con arco_transformacion declarado) desaparece entre los caps ${gapDesde} y ${gapHasta} (${gapHasta - gapDesde} caps sin presencia, umbral ${gapUmbral}) y luego reaparece. Una reaparición tras una brecha tan larga sin escenas intermedias hace que el lector lo haya olvidado y que su arco avance "fuera de cámara".`,
        sugerencia: `Inserta al menos 1 escena entre los caps ${gapDesde} y ${gapHasta} donde "${sec.nombre}" haga avanzar su arco en pantalla (una decisión, un conflicto con el protagonista, un pequeño revés o ganancia). El arco del secundario debe verse evolucionar, no saltar de A a Z.`,
      });
      continue;
    }

    conformes += 1;
  }

  const coverage = auditados > 0 ? conformes / auditados : 1;
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
  renderArea("4) ARCO COMPLETO DEL SECRETO (siembra textual ≥3 caps)", byArea["arco_secreto"]);
  renderArea("5) FALSO ALIADO (reveal tardío + humanización previa)", byArea["falso_aliado"]);
  renderArea("6) ESCALADA DE APUESTAS EN EL ACTO 2 (anti bucle de presión)", byArea["escalada_acto2"]);
  renderArea("7) DEUS EX MACHINA (informante / portador sin siembra)", byArea["deus_ex_machina"]);
  renderArea("8) TRAUMA ACTIVO DEL PROTAGONISTA (primer 60% de la novela)", byArea["trauma_protagonista"]);
  renderArea("9) CONTINUIDAD DE ARCO SECUNDARIO (sin abandono ni brechas largas)", byArea["arco_secundario"]);

  lines.push("REGLA ANTI-RECURRENCIA: en la próxima generación, declara y respeta ESTOS campos por capítulo:");
  lines.push(
    `- "forma_dominante" (1 valor de: ${FORMA_ESCENA_VALORES.join(", ")}). En ventanas de 4 caps consecutivos del acto 2, ningún valor puede repetirse más de 2 veces.`
  );
  lines.push(
    `- "categoria_info_nueva" (1 valor de: ${CATEGORIA_INFO_VALORES.join(", ")}). En el acto 2/3 no puede haber 2 caps consecutivos con "informacion_nueva" vacía o de relleno; en ventanas de 4 caps del acto 2 ningún valor puede repetirse más de 2 veces; "ninguna" no puede aparecer 2 veces seguidas.`
  );
  lines.push(
    `- "revelaciones_dosificadas" (array). Toda revelación con dificultad "alto" debe traer modo_extraccion != "sin_resistencia" y al menos 1 cap en setup_capitulos. Ningún cap puede acumular ≥3 revelaciones de dificultad alta. Ningún personaje antagonista/cómplice puede revelar ≥3 hechos en un único capítulo.`
  );
  lines.push(
    `- "apuesta_dramatica" (1 valor de: ${APUESTA_VALORES.join(", ")}). En el acto 2 no puede haber 3+ caps consecutivos con apuesta IGUAL o DECRECIENTE; al menos 1 cap del acto 2 debe ser "alta" o "critica" (punto de no retorno antes del clímax).`
  );
  lines.push(
    `- Para cada revelación "alto" en el último 25% de la novela, su "personaje_revelador" (si no es el protagonista) debe haber aparecido en ≥2 caps anteriores (elenco_presente o mención textual con beat propio). Personajes nuevos en el último cuarto = deus ex machina.`
  );
  lines.push(
    `- Si el world_bible declara trauma/herida/secreto/motivación oculta del protagonista, el primer 60% de la novela debe contener ≥3 caps donde el protagonista esté presente Y el cap tenga forma_dominante "introspeccion" o "recuerdo_flashback", o categoria_info_nueva "memoria_revelada" / "revelacion_personal" / "confesion_emocional" / "transformacion_personal". El trauma debe ser palanca activa, no apéndice.`
  );
  return lines.join("\n");
}

// ────────────────────────────────────────────────────────────────────
// [Fix117] Autopatch determinista de `setup_capitulos` decorativos.
// Reutiliza exactamente la misma lógica de detección de siembra textual
// que `auditArcoSecreto` (extractSiembraTokens + capCorpus + reglas de
// nombre propio) para reescribir los arrays `setup_capitulos` que el
// Arquitecto declara apuntando a caps que NO mencionan el hecho. La
// siembra real existe en otros caps — solo hay que sincronizar la
// metadata con la realidad textual. 0 coste de tokens, una pasada.
//
// Returns: { patched: número de revelaciones cuyo array fue corregido,
//            details: [{cap, hecho, antes, despues}] para activity log }
// ────────────────────────────────────────────────────────────────────
export function autopatchDecorativeSetupCapitulos(escaleta: any[]): {
  patched: number;
  details: Array<{ cap: number; hecho: string; antes: number[]; despues: number[] }>;
} {
  const { all } = getActSlices(escaleta);
  const tokensByCap: Record<number, Set<string>> = {};
  for (const c of all) {
    const norm = capCorpus(c)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    tokensByCap[capNum(c)] = new Set(norm.split(/\s+/).filter(Boolean));
  }

  let patched = 0;
  const details: Array<{ cap: number; hecho: string; antes: number[]; despues: number[] }> = [];

  for (const cap of all) {
    const num = capNum(cap);
    const revs: any[] = Array.isArray(cap.revelaciones_dosificadas)
      ? cap.revelaciones_dosificadas
      : [];
    for (const r of revs) {
      const dificultad = String(r?.dificultad || "").toLowerCase();
      if (dificultad !== "alto" && dificultad !== "medio") continue;
      const hecho = String(r?.hecho_revelado || "");
      const tokens = extractSiembraTokens(hecho);
      if (tokens.length < 2) continue;

      const declarados = Array.isArray(r?.setup_capitulos)
        ? r.setup_capitulos.filter(
            (n: any) => typeof n === "number" && n < num
          )
        : [];
      if (declarados.length === 0) continue;

      // Misma lógica de nombre propio que auditArcoSecreto
      const nombrePropioTokens = new Set<string>();
      const personajeRevelador = String(r?.personaje_revelador || "").trim();
      if (personajeRevelador) {
        for (const piece of personajeRevelador.split(/\s+/)) {
          const norm = piece
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase();
          if (norm.length >= 4) nombrePropioTokens.add(norm);
        }
      }
      for (const m of hecho.matchAll(/\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{3,}/g)) {
        const norm = m[0]
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase();
        nombrePropioTokens.add(norm);
      }

      const priorCaps = all.filter((c: any) => capNum(c) < num);
      const sembradosEn: number[] = [];
      for (const prev of priorCaps) {
        const capTokens = tokensByCap[capNum(prev)];
        if (!capTokens || capTokens.size === 0) continue;
        const hitTokens = tokens.filter((t) => capTokens.has(t));
        if (hitTokens.length === 0) continue;
        const fuertes = hitTokens.filter((t) => !nombrePropioTokens.has(t));
        if (fuertes.length >= 1 || hitTokens.length >= 2) {
          sembradosEn.push(capNum(prev));
        }
      }

      // Filtramos los declarados sin siembra real
      const declaradosConHit = declarados.filter((cap: number) =>
        sembradosEn.includes(cap)
      );
      const noSembrados = declarados.filter(
        (cap: number) => !sembradosEn.includes(cap)
      );

      // Solo patcheamos si: (a) hay decorativos que sustituir Y
      // (b) hay siembra real alternativa para escribir en el array.
      // Si sembradosEn está vacío, el problema es real (siembra
      // insuficiente) y NO es un mismatch de metadata — lo dejamos
      // intacto para que el auditor lo reporte y el Arquitecto lo
      // arregle de verdad.
      if (noSembrados.length === 0 || sembradosEn.length === 0) continue;

      // Construimos el nuevo array: priorizamos los que el Arquitecto
      // declaró bien (declaradosConHit, preserva su intención) +
      // completamos con el resto de sembradosEn hasta cubrir minSiembra.
      const minSiembra = dificultad === "alto" ? 3 : 2;
      const nuevoSet = new Set<number>(declaradosConHit);
      for (const cap of sembradosEn) {
        if (nuevoSet.size >= minSiembra && nuevoSet.size >= declaradosConHit.length) {
          // Si ya tenemos suficiente y los declarados-con-hit están todos,
          // no añadimos más para no inflar el array.
          break;
        }
        nuevoSet.add(cap);
      }
      const nuevoArray = Array.from(nuevoSet).sort((a, b) => a - b);

      // Sanity: el array nuevo debe diferir del original
      const antesOrdenado = [...declarados].sort((a: number, b: number) => a - b);
      if (
        nuevoArray.length === antesOrdenado.length &&
        nuevoArray.every((v, i) => v === antesOrdenado[i])
      ) {
        continue;
      }

      r.setup_capitulos = nuevoArray;
      patched += 1;
      const hechoCorto = hecho.length > 60 ? hecho.slice(0, 57) + "..." : hecho;
      details.push({
        cap: num,
        hecho: hechoCorto,
        antes: antesOrdenado,
        despues: nuevoArray,
      });
    }
  }

  return { patched, details };
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
  const arco = auditArcoSecreto(escaleta);
  const fa = auditFalsoAliado(escaleta, worldBible);
  const esc = auditEscaladaActo2(escaleta);
  const dem = auditDeusExMachina(escaleta, worldBible);
  const trauma = auditTraumaProtagonista(escaleta, worldBible);
  const arcoSec = auditArcoSecundario(escaleta, worldBible);

  const problemas = [
    ...forma.problemas,
    ...ledger.problemas,
    ...dos.problemas,
    ...arco.problemas,
    ...fa.problemas,
    ...esc.problemas,
    ...dem.problemas,
    ...trauma.problemas,
    ...arcoSec.problemas,
  ];
  const altas = problemas.filter((p) => p.severidad === "alta").length;
  const medias = problemas.filter((p) => p.severidad === "media").length;

  const rawScore = 10 - 2 * altas - 0.7 * medias;
  const score = Math.max(1, Math.min(10, rawScore));
  let veredicto: "apto" | "necesita_revision" | "reescribir";
  if (altas === 0 && medias <= 1) veredicto = "apto";
  else if (altas <= 1 && medias <= 3) veredicto = "necesita_revision";
  else veredicto = "reescribir";

  const resumen = `Auditoría estructural: ${altas} problemas altos, ${medias} medios. Forma: ${forma.problemas.length}; Ledger: ${ledger.problemas.length}; Dosificación: ${dos.problemas.length}; Arco secreto: ${arco.problemas.length}; Falso aliado: ${fa.problemas.length}; Escalada acto 2: ${esc.problemas.length}; Deus ex machina: ${dem.problemas.length}; Trauma protagonista: ${trauma.problemas.length}; Arco secundario: ${arcoSec.problemas.length}. Cobertura forma=${Math.round(forma.coverage * 100)}% ledger=${Math.round(ledger.coverage * 100)}% dosif=${Math.round(dos.coverage * 100)}% arco=${Math.round(arco.coverage * 100)}% aliado=${Math.round(fa.coverage * 100)}% apuesta=${Math.round(esc.coverage * 100)}% deus=${Math.round(dem.coverage * 100)}% trauma=${Math.round(trauma.coverage * 100)}% arcoSec=${Math.round(arcoSec.coverage * 100)}%.`;

  return {
    puntuacion_global: Math.round(score * 10) / 10,
    veredicto,
    problemas,
    coverage: {
      forma_dominante_pct: Math.round(forma.coverage * 100) / 100,
      categoria_info_pct: Math.round(ledger.coverage * 100) / 100,
      revelaciones_dosificadas_pct: Math.round(dos.coverage * 100) / 100,
      arco_secreto_pct: Math.round(arco.coverage * 100) / 100,
      falso_aliado_pct: Math.round(fa.coverage * 100) / 100,
      apuesta_dramatica_pct: Math.round(esc.coverage * 100) / 100,
      deus_ex_machina_pct: Math.round(dem.coverage * 100) / 100,
      trauma_protagonista_pct: Math.round(trauma.coverage * 100) / 100,
      arco_secundario_pct: Math.round(arcoSec.coverage * 100) / 100,
    },
    resumen,
    instrucciones_revision: problemas.length > 0 ? buildInstructions(problemas) : "",
  };
}
