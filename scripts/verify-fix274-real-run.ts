// [Task14] Verificación en run real de Fix274: el Cirujano de Escaletas debe
// SEMBRAR en los caps añadidos al lote (setup_capitulos poblados) en vez de
// rebajar dificultad/vaciar setups. Ejecuta el brazo real del orquestador
// (runEscaletaResidualSurgery) con LLM real (DeepSeek) sobre una escaleta
// sintética con un arco secreto sin sembrar.
//
// Uso: npx tsx scripts/verify-fix274-real-run.ts
import { Orchestrator } from "../server/orchestrator";
import { storage } from "../server/storage";
import { runArchitectStructuralAudits } from "../server/agents/scene-shape-auditor";
import { problemaExigeSiembra } from "../server/agents/escaleta-surgeon";

const DRY = process.env.DRY === "1";

function cap(numero: number, titulo: string, sinopsis: string, beats: string[], extra: any = {}) {
  return {
    numero,
    titulo,
    tipo_capitulo: "M",
    objetivo_narrativo: sinopsis,
    sinopsis,
    beats,
    eventos_pivotales: beats.slice(0, 1),
    informacion_nueva: sinopsis,
    escena_principal: sinopsis,
    revelaciones_dosificadas: [],
    ...extra,
  };
}

// Bloque de propulsión válido para silenciar las dims de cobertura.
function prop(cambio: string, decision: string, consecuencia: string, vectores: string[]) {
  return {
    cambio_irreversible: cambio,
    coste_pagado: "Marta paga un coste personal concreto en esta escena",
    decision_final: decision,
    consecuencia_siguiente: consecuencia,
    vectores_modificados: vectores,
  };
}

async function main() {
  // Escaleta sintética: novela de misterio de 8 caps. La revelación de alta
  // dificultad del cap 5 (el collar = llave del archivo sellado) NO está
  // sembrada en ningún cap anterior -> siembra_textual_insuficiente_alto.
  const escaleta = [
    cap(1, "La casa heredada", "Marta llega a la casa de su abuela en Comillas tras el funeral y encuentra el despacho cerrado con llave.", [
      "Marta recibe las llaves del notario",
      "Descubre que el despacho de la abuela está sellado",
      "Encuentra cartas sin remitente en el buzón",
    ], {
      forma_dominante: "atmosferica",
      categoria_info_nueva: "antecedente_historico",
      apuesta_dramatica: "baja",
      informacion_nueva: "El despacho de la abuela lleva sellado desde 1987 y nadie del pueblo quiere hablar de ello.",
      propulsion: prop(
        "Marta firma la aceptación de la herencia y ya no puede desentenderse de la casa ni de su historia",
        "Marta decide quedarse en Comillas a averiguar por qué el despacho está sellado",
        "Su presencia en el pueblo alerta al vecino Andrés, que la visita en el cap 2",
        ["objetivo", "informacion"],
      ),
      revelaciones_dosificadas: [
        { hecho_revelado: "El despacho de la abuela lleva sellado desde 1987", dificultad: "bajo", personaje_revelador: "el notario", setup_capitulos: [] },
      ],
    }),
    cap(2, "El vecino que sabía demasiado", "El vecino Andrés insinúa que la abuela guardaba documentos comprometedores del astillero.", [
      "Andrés visita a Marta con un pastel y demasiadas preguntas",
      "Marta encuentra una foto de la abuela con un hombre desconocido",
      "Alguien ha forzado la puerta trasera durante la noche",
    ], {
      forma_dominante: "pivote_relacional",
      categoria_info_nueva: "amenaza",
      apuesta_dramatica: "media",
      informacion_nueva: "Alguien ha entrado en la casa de noche buscando algo concreto; Andrés sabe más de lo que dice.",
      propulsion: prop(
        "La puerta trasera forzada demuestra que alguien busca algo en la casa: la casa deja de ser un refugio",
        "Marta decide investigar el astillero en el archivo municipal",
        "La búsqueda en el archivo municipal del cap 3 nace directamente del allanamiento",
        ["riesgo", "relacion"],
      ),
      revelaciones_dosificadas: [
        { hecho_revelado: "La abuela guardaba documentos comprometedores del astillero", dificultad: "bajo", personaje_revelador: "Andrés", setup_capitulos: [1] },
      ],
    }),
    cap(3, "Papeles del astillero", "Marta investiga en el archivo municipal la quiebra del astillero y encuentra el nombre de su abuela en las actas.", [
      "El archivero le niega el acceso a las actas de 1987",
      "Marta fotografía a escondidas un legajo",
      "Una llamada anónima le dice que deje de remover el pasado",
    ], {
      forma_dominante: "investigacion_activa",
      categoria_info_nueva: "evidencia_fisica",
      apuesta_dramatica: "media",
      informacion_nueva: "Las actas de 1987 vinculan a la abuela con la quiebra del astillero y alguien vigila a quien pregunta.",
      propulsion: prop(
        "La llamada anónima convierte la curiosidad en amenaza directa: Marta ya está señalada",
        "Marta decide abrir la caja de seguridad de la abuela en el banco",
        "La visita al banco del cap 4 es la única pista material que le queda",
        ["informacion", "riesgo"],
      ),
      revelaciones_dosificadas: [
        { hecho_revelado: "La abuela figura en las actas de la quiebra del astillero de 1987", dificultad: "medio", personaje_revelador: "las actas", setup_capitulos: [2] },
      ],
    }),
    cap(4, "La caja del banco", "Marta abre la caja de seguridad de la abuela: dentro solo hay un pañuelo y un recibo de una joyería.", [
      "El director del banco la trata con nerviosismo",
      "La caja está casi vacía: pañuelo y recibo de joyería",
      "Andrés aparece 'casualmente' en la puerta del banco",
    ], {
      forma_dominante: "setback",
      categoria_info_nueva: "pista_falsa",
      apuesta_dramatica: "media",
      informacion_nueva: "La caja de seguridad está casi vacía: solo un pañuelo y un recibo de joyería de hace décadas.",
      propulsion: prop(
        "Al abrir la caja, Marta agota su última pista obvia: ya no hay camino fácil hacia los documentos",
        "Marta decide seguir el recibo hasta la joyería",
        "La visita a la joyería del cap 5 es la consecuencia directa del recibo",
        ["recursos", "objetivo"],
      ),
      revelaciones_dosificadas: [
        { hecho_revelado: "La caja de seguridad solo contiene un pañuelo y un recibo de joyería", dificultad: "bajo", personaje_revelador: "la caja", setup_capitulos: [3] },
      ],
    }),
    cap(5, "La llave que no era joya", "Marta descubre que el collar de la abuela es en realidad la llave del archivo sellado del astillero.", [
      "Marta lleva el collar a la joyería del recibo",
      "El joyero reconoce la pieza: es una llave-troquel del archivo sellado",
      "Marta comprende que la abuela lo planeó todo",
    ], {
      forma_dominante: "revelacion",
      categoria_info_nueva: "regla_del_mundo",
      apuesta_dramatica: "alta",
      informacion_nueva: "El collar heredado no es una joya: es una llave-troquel que abre el archivo sellado del astillero.",
      propulsion: prop(
        "El joyero identifica el collar como llave-troquel: la herencia entera cambia de significado",
        "Marta decide entrar esa misma noche al archivo sellado del astillero",
        "La incursión nocturna del cap 6 depende de la llave recién descubierta",
        ["informacion", "objetivo", "poder"],
      ),
      revelaciones_dosificadas: [
        {
          hecho_revelado: "El collar de la abuela es la llave-troquel que abre el archivo sellado del astillero",
          dificultad: "alto",
          personaje_revelador: "el joyero",
          setup_capitulos: [],
        },
      ],
    }),
    cap(6, "El archivo sellado", "Con la llave, Marta entra al archivo del astillero y encuentra los contratos falsificados.", [
      "Marta entra de noche al archivo con la llave-troquel",
      "Encuentra contratos falsificados con la firma del alcalde",
      "Andrés la sorprende dentro del archivo",
    ], {
      forma_dominante: "accion_fisica",
      categoria_info_nueva: "evidencia_fisica",
      apuesta_dramatica: "alta",
      informacion_nueva: "Los contratos falsificados del archivo llevan la firma del alcalde: la quiebra fue un desfalco.",
      propulsion: prop(
        "Marta sustrae los contratos falsificados: cruza una línea legal que ya no puede deshacer",
        "Marta decide encararse con Andrés y exigirle la verdad",
        "La confesión de Andrés en el cap 7 es forzada por haberla sorprendido en el archivo",
        ["poder", "riesgo", "relacion"],
      ),
      revelaciones_dosificadas: [
        { hecho_revelado: "Los contratos falsificados llevan la firma del alcalde", dificultad: "alto", personaje_revelador: "Marta", setup_capitulos: [3, 5] },
      ],
    }),
    cap(7, "Aliados y traidores", "Andrés confiesa que trabajaba para la abuela; el verdadero enemigo es el alcalde.", [
      "Andrés muestra las cartas que la abuela le confió",
      "Planean hacer públicos los contratos",
      "El alcalde envía a sus hombres a la casa",
    ], {
      forma_dominante: "confrontacion_directa",
      categoria_info_nueva: "revelacion_personal",
      apuesta_dramatica: "critica",
      informacion_nueva: "Andrés era el hombre de confianza de la abuela; el alcalde sabe que Marta tiene los contratos.",
      propulsion: prop(
        "El alcalde envía a sus hombres a la casa: la amenaza pasa de anónima a física y con plazo",
        "Marta decide convocar a la prensa antes de que le quiten los documentos",
        "La rueda de prensa del cap 8 es la única salida que les queda",
        ["relacion", "riesgo", "decision"],
      ),
      revelaciones_dosificadas: [
        { hecho_revelado: "Andrés trabajaba en secreto para la abuela", dificultad: "medio", personaje_revelador: "Andrés", setup_capitulos: [2, 4] },
      ],
    }),
    cap(8, "El precio de la verdad", "Marta publica los documentos y el alcalde cae; la casa deja de ser una herencia y pasa a ser un hogar.", [
      "Rueda de prensa con los contratos falsificados",
      "Detención del alcalde",
      "Marta decide quedarse en Comillas",
    ], {
      forma_dominante: "ceremonia_ritual",
      categoria_info_nueva: "transformacion_personal",
      apuesta_dramatica: "critica",
      informacion_nueva: "Los documentos publicados tumban al alcalde; Marta entiende por fin el plan completo de la abuela.",
      propulsion: prop(
        "La publicación de los contratos es irreversible: el alcalde es detenido y el pueblo conoce la verdad",
        "Marta decide quedarse a vivir en Comillas y reabrir el despacho de la abuela",
        "Cierre de la novela: la herencia se convierte en hogar",
        ["poder", "objetivo", "relacion"],
      ),
      revelaciones_dosificadas: [
        { hecho_revelado: "El alcalde es detenido gracias a los contratos publicados", dificultad: "bajo", personaje_revelador: "la prensa", setup_capitulos: [6, 7] },
      ],
    }),
  ];

  const worldBible = {
    personajes: [
      { nombre: "Marta", rol: "protagonista", descripcion: "Nieta que hereda la casa" },
      { nombre: "Andrés", rol: "aliado ambiguo", descripcion: "Vecino que trabajaba para la abuela" },
    ],
    tramas: [],
  };
  const data: any = { world_bible: worldBible, escaleta_capitulos: escaleta };

  const pre = runArchitectStructuralAudits(escaleta as any[], worldBible, undefined);
  console.log(`\n=== PRE-AUDIT === score=${pre.puntuacion_global}/10, problemas=${pre.problemas.length}`);
  for (const p of pre.problemas) {
    console.log(`  [${p.severidad}] ${p.tipo} caps=${JSON.stringify(p.capitulos)} siembra=${problemaExigeSiembra(p as any)} :: ${String(p.descripcion).slice(0, 140)}`);
  }
  if (!pre.problemas.some(p => problemaExigeSiembra(p as any))) {
    console.error("FIXTURE INVÁLIDA: ningún problema exige siembra. Abortando sin gastar LLM.");
    process.exit(2);
  }
  // Para que Fix274 amplíe el lote, el cap más temprano citado por los
  // problemas debe dejar hueco por delante (>= 3).
  const citedCaps = pre.problemas.flatMap(p => p.capitulos || []);
  const earliestCited = Math.min(...(citedCaps.length ? citedCaps : [Infinity]));
  console.log(`  cap más temprano citado: ${earliestCited}`);
  if (earliestCited < 3) {
    console.error("FIXTURE INVÁLIDA: hay problemas que citan caps < 3, el lote ya incluiría caps sembrables sin necesitar Fix274. Abortando sin gastar LLM.");
    process.exit(2);
  }
  if (DRY) { console.log("DRY=1: fin sin llamar al LLM."); process.exit(0); }

  const project = await storage.createProject({
    title: "[TEST Fix274] La llave de Comillas",
    premise: "Una nieta hereda una casa y descubre que el collar de su abuela abre el archivo que hunde al alcalde.",
    genre: "mystery",
    tone: "dramatic",
    chapterCount: 8,
  } as any);
  console.log(`\nProyecto de prueba creado: id=${project.id}`);

  const orch = new Orchestrator({
    onAgentStatus: () => {},
    onChapterComplete: () => {},
    onChapterRewrite: () => {},
    onChapterStatusChange: () => {},
    onProjectComplete: () => {},
    onError: (e: string) => console.error(`[orch error] ${e}`),
  } as any);

  // minScore alto para forzar el brazo quirúrgico aunque el score base no sea bajo.
  const minScore = Math.min(9.5, Math.max(7, pre.puntuacion_global + 0.5));
  console.log(`\nLanzando runEscaletaResidualSurgery (minScore=${minScore}) con LLM real...`);
  const t0 = Date.now();
  const out = await (orch as any).runEscaletaResidualSurgery(project, data, undefined, minScore);
  console.log(`\n=== RESULTADO === (${Math.round((Date.now() - t0) / 1000)}s) score=${out.score}/10 (pre=${pre.puntuacion_global}) rounds=${out.rounds} improved=${out.improved} cleaned=${out.cleaned}`);

  const postEscaleta = (out.data as any).escaleta_capitulos as any[];
  for (const c of postEscaleta) {
    const revs = Array.isArray(c.revelaciones_dosificadas) ? c.revelaciones_dosificadas : [];
    for (const r of revs) {
      console.log(`  cap ${c.numero}: rev "${String(r.hecho_revelado).slice(0, 80)}" dificultad=${r.dificultad} setup_capitulos=${JSON.stringify(r.setup_capitulos)}`);
    }
  }
  // ¿Se sembró de verdad? Los caps 3-4 (añadidos por Fix274 al lote del cap 5)
  // deben mencionar tokens del hecho (collar/llave/archivo) en su texto.
  for (const n of [3, 4]) {
    const c = postEscaleta.find(x => x.numero === n);
    const corpus = JSON.stringify(c).toLowerCase();
    const hits = ["collar", "llave", "archivo", "joyer"].filter(t => corpus.includes(t));
    console.log(`  cap ${n} tokens de siembra presentes: ${JSON.stringify(hits)}`);
  }

  const logs = await storage.getActivityLogsByProject(project.id, 100);
  console.log(`\n=== ACTIVITY LOGS (proyecto ${project.id}) ===`);
  for (const l of logs.slice().reverse()) console.log(`  [${l.level}] ${String(l.message).slice(0, 220)}`);

  process.exit(0);
}

main().catch(e => { console.error("FALLO:", e); process.exit(1); });
