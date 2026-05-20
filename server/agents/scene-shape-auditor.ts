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
  area:
    | "forma_escena"
    | "ledger_info"
    | "dosificacion_revelacion"
    | "arco_secreto"
    | "falso_aliado";
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
  const tokens = t.split(/\s+/).filter((tok) => {
    if (tok.length < 5) return false;
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

  const corpusByCap: Record<number, string> = {};
  for (const c of all) {
    corpusByCap[capNum(c)] = capCorpus(c)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
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
      for (const prev of priorCaps) {
        const corpus = corpusByCap[capNum(prev)] || "";
        if (!corpus) continue;
        const hits = tokens.filter((t) => corpus.includes(t)).length;
        if (hits >= 2) {
          siembraCount += 1;
          sembradosEn.push(capNum(prev));
        }
      }
      const minSiembra = dificultad === "alto" ? 3 : 2;
      const hechoCorto = hecho.length > 90 ? hecho.slice(0, 87) + "..." : hecho;
      const declarados = Array.isArray(r?.setup_capitulos)
        ? r.setup_capitulos.filter((n: any) => typeof n === "number")
        : [];

      if (siembraCount >= minSiembra) {
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

      problemas.push({
        area: "arco_secreto",
        tipo:
          dificultad === "alto"
            ? "siembra_textual_insuficiente_alto"
            : "siembra_textual_insuficiente_medio",
        severidad: dificultad === "alto" ? "alta" : "media",
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
// (5) [Fix94] Falso aliado — patrón "Cifuentes era el topo desde cap 2".
// Para cada personaje del world_bible con rol topo/traidor/falso_aliado/
// antagonista_oculto/cómplice_oculto/infiltrado/doble_agente:
//   (A) la revelación de su traición no puede ocurrir antes del 60% del
//       total de caps (si ocurre antes, el lector lo ve venir y el giro
//       pierde fuerza).
//   (B) debe haber al menos 1 cap previo al reveal donde el personaje
//       aparezca con "forma_dominante" en {introspeccion, pivote_relacional}
//       o "categoria_info_nueva" == "vinculo_emocional" — la escena de
//       duda/humanización que hace doler la traición.
// ────────────────────────────────────────────────────────────────────
const TRAITOR_ROLE_PATTERNS = [
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
];

// Keywords aceptadas dentro de `hecho_revelado` (campo declarativo y corto
// de revelaciones_dosificadas — el Arquitecto declara una sola idea). Aquí
// SÍ es seguro usar la lista de palabras clave porque el campo no contiene
// frases de sospecha sino la revelación misma.
const HECHO_REVEAL_KEYWORDS = [
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
        categoria === "vinculo_emocional"
      );
    });
    if (!tienesHumanizacion) {
      problemas.push({
        area: "falso_aliado",
        tipo: "sin_humanizacion_previa",
        severidad: "media",
        capitulos: [revealCap],
        descripcion: `La traición de "${tr.nombre}" se revela en el cap ${revealCap} pero ningún capítulo anterior contiene una escena de humanización del personaje (forma_dominante "introspeccion" o "pivote_relacional", o categoria_info_nueva "vinculo_emocional" con "${tr.nombre}" en escena). El giro funciona pero NO DUELE: el lector no había construido vínculo con el traidor.`,
        sugerencia: `Antes del cap ${revealCap}, añade al menos 1 capítulo donde "${tr.nombre}" tenga una escena que lo humanice: un momento a solas en su despacho mirando fotos, una llamada con tono cansado a un familiar, una conversación con el protagonista donde muestre algo personal (un miedo, un recuerdo, una preocupación que parezca sincera). Marca ese cap con forma_dominante "pivote_relacional" o "introspeccion" y categoria_info_nueva "vinculo_emocional". Anti patrón Cifuentes: "se derrumba solo al final lo hace menos trágico y previsible".`,
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
  const arco = auditArcoSecreto(escaleta);
  const fa = auditFalsoAliado(escaleta, worldBible);

  const problemas = [
    ...forma.problemas,
    ...ledger.problemas,
    ...dos.problemas,
    ...arco.problemas,
    ...fa.problemas,
  ];
  const altas = problemas.filter((p) => p.severidad === "alta").length;
  const medias = problemas.filter((p) => p.severidad === "media").length;

  const rawScore = 10 - 2 * altas - 0.7 * medias;
  const score = Math.max(1, Math.min(10, rawScore));
  let veredicto: "apto" | "necesita_revision" | "reescribir";
  if (altas === 0 && medias <= 1) veredicto = "apto";
  else if (altas <= 1 && medias <= 3) veredicto = "necesita_revision";
  else veredicto = "reescribir";

  const resumen = `Auditoría estructural: ${altas} problemas altos, ${medias} medios. Forma: ${forma.problemas.length}; Ledger: ${ledger.problemas.length}; Dosificación: ${dos.problemas.length}; Arco secreto: ${arco.problemas.length}; Falso aliado: ${fa.problemas.length}. Cobertura forma=${Math.round(forma.coverage * 100)}% ledger=${Math.round(ledger.coverage * 100)}% dosif=${Math.round(dos.coverage * 100)}% arco=${Math.round(arco.coverage * 100)}% aliado=${Math.round(fa.coverage * 100)}%.`;

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
    },
    resumen,
    instrucciones_revision: problemas.length > 0 ? buildInstructions(problemas) : "",
  };
}
