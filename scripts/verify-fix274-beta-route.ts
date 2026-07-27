// [Task16] Verificación en run real de la SEGUNDA ruta de Fix274: la cirugía
// por feedback del LECTOR BETA (runBetaFeedbackEscaletaSurgery, extraída del
// bucle Beta del orquestador). Cuando el Beta pide sembrar "antes", el lote
// debe ampliarse con caps anteriores sembrables (log "[Fix274] Lote de
// cirugía (feedback Beta) ampliado...") y el Cirujano debe SEMBRAR en esos
// caps (setup_capitulos poblados) en vez de rebajar dificultad/vaciar setups.
//
// Uso: npx tsx scripts/verify-fix274-beta-route.ts   (DRY=1 para no gastar LLM)
import { Orchestrator } from "../server/orchestrator";
import { storage } from "../server/storage";
import { problemaExigeSiembra } from "../server/agents/escaleta-surgeon";
import { buildFix274Fixture } from "./fix274-fixture";

const DRY = process.env.DRY === "1";

async function main() {
  const { data } = buildFix274Fixture();

  // Feedback sintético del Lector Beta, con la forma exacta de
  // OutlineBetaReaderResult: UN problema mayor anclado al cap 5 que exige
  // sembrar la revelación del collar en capítulos anteriores.
  const beta = {
    puntuacion_global: 6,
    perfil_lector_objetivo: "Lector de misterio clásico que exige juego limpio con las pistas.",
    veredicto: "necesita_revision" as const,
    resumen: "La revelación del collar-llave del cap 5 cae de la nada: el lector la vivirá como trampa.",
    fortalezas: ["Escalada de tensión sostenida", "Antagonista con motivación clara"],
    problemas: [
      {
        tipo: "expectativa_lector" as const,
        severidad: "mayor" as const,
        capitulos_afectados: [5],
        descripcion:
          "La revelación de que el collar de la abuela es la llave-troquel del archivo sellado (cap 5) no tiene ninguna pista previa: ningún capítulo anterior menciona el collar ni lo asocia a nada mecánico. El lector de misterio lo vivirá como deus ex machina.",
        como_lo_viviria_el_lector:
          "Sentirá que el autor hizo trampa: una pieza clave aparece sin haber sido plantada.",
        sugerencia_concreta:
          "Siembra pistas del collar ANTES del cap 5: que aparezca físicamente y llame la atención en capítulos previos (por ejemplo, un detalle raro en el troquelado o alguien que se fija en él), y rellena setup_capitulos de esa revelación con esos capítulos.",
      },
    ],
    instrucciones_revision:
      "1. [mayor] Siembra el collar-llave en capítulos anteriores al 5 y puebla setup_capitulos de la revelación del cap 5.",
  };

  // Precondiciones de la fixture (mismas guardas que verify-fix274-real-run):
  const p0 = beta.problemas[0];
  if (!problemaExigeSiembra({ tipo: p0.tipo, descripcion: p0.descripcion, sugerencia: p0.sugerencia_concreta })) {
    console.error("FIXTURE INVÁLIDA: el problema del Beta no dispara problemaExigeSiembra. Abortando sin gastar LLM.");
    process.exit(2);
  }
  const earliest = Math.min(...beta.problemas.flatMap(p => p.capitulos_afectados));
  if (earliest < 3) {
    console.error("FIXTURE INVÁLIDA: el cap más temprano citado deja sin margen la ampliación Fix274. Abortando.");
    process.exit(2);
  }
  console.log(`Precondiciones OK: problema mayor anclado al cap ${earliest}, exige siembra -> Fix274 debe ampliar el lote con caps ${earliest - 2} y ${earliest - 1}.`);
  if (DRY) { console.log("DRY=1: fin sin llamar al LLM."); process.exit(0); }

  const project = await storage.createProject({
    title: "[TEST Fix274 ruta Beta] La llave de Comillas",
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

  // Capturamos stdout para verificar el log de ampliación del lote.
  const logLines: string[] = [];
  const origLog = console.log.bind(console);
  console.log = (...args: any[]) => { logLines.push(args.map(String).join(" ")); origLog(...args); };

  console.log(`\nLanzando runBetaFeedbackEscaletaSurgery (ruta Beta) con LLM real...`);
  const t0 = Date.now();
  const out = await (orch as any).runBetaFeedbackEscaletaSurgery(project, data, beta, 1, (project as any).premise);
  console.log = origLog;
  console.log(`\n=== RESULTADO === (${Math.round((Date.now() - t0) / 1000)}s) done=${out.done}`);

  let ok = true;
  const ampliado = logLines.some(l => l.includes("[Fix274] Lote de cirugía (feedback Beta) ampliado"));
  console.log(`  log de ampliación Fix274 (ruta Beta) emitido: ${ampliado ? "SÍ" : "NO"}`);
  if (!ampliado) ok = false;
  if (!out.done) { console.log("  FALLO: la cirugía no se aplicó (done=false)."); ok = false; }

  const postEscaleta = (out.data as any).escaleta_capitulos as any[];
  const cap5 = postEscaleta.find(c => c.numero === 5);
  const rev5 = (cap5?.revelaciones_dosificadas || []).find((r: any) => /collar|llave/i.test(String(r.hecho_revelado)));
  console.log(`  cap 5 rev collar: dificultad=${rev5?.dificultad} setup_capitulos=${JSON.stringify(rev5?.setup_capitulos)}`);
  if (!rev5) { console.log("  FALLO: la revelación del collar desapareció del cap 5."); ok = false; }
  else {
    if (rev5.dificultad !== "alto") { console.log("  FALLO: la dificultad fue rebajada."); ok = false; }
    if (!Array.isArray(rev5.setup_capitulos) || rev5.setup_capitulos.length === 0) {
      console.log("  FALLO: setup_capitulos sigue vacío."); ok = false;
    } else if (!rev5.setup_capitulos.every((n: number) => n < 5)) {
      console.log("  FALLO: setup_capitulos cita caps no anteriores al 5."); ok = false;
    }
  }
  // ¿Los caps añadidos por Fix274 (3-4) siembran de verdad?
  for (const n of [3, 4]) {
    const c = postEscaleta.find(x => x.numero === n);
    const corpus = JSON.stringify(c).toLowerCase();
    const hits = ["collar", "llave", "archivo", "joyer", "troquel"].filter(t => corpus.includes(t));
    console.log(`  cap ${n} tokens de siembra presentes: ${JSON.stringify(hits)}`);
  }

  const logs = await storage.getActivityLogsByProject(project.id, 100);
  console.log(`\n=== ACTIVITY LOGS (proyecto ${project.id}) ===`);
  let rebajas = 0;
  for (const l of logs.slice().reverse()) {
    if (String(l.message).includes("Red anti-rebaja")) rebajas++;
    console.log(`  [${l.level}] ${String(l.message).slice(0, 220)}`);
  }
  console.log(`\n  disparos de la red anti-rebaja: ${rebajas}`);
  if (rebajas > 0) { console.log("  FALLO: la red anti-rebaja se disparó."); ok = false; }

  console.log(`\n=== VEREDICTO === ${ok ? "OK: ruta Beta de Fix274 verificada (lote ampliado, siembra real, sin rebajas)" : "FALLO: revisa los puntos marcados arriba"}`);
  process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error("FALLO:", e); process.exit(1); });
