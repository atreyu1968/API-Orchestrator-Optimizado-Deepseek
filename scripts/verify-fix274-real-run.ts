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
import { buildFix274Fixture } from "./fix274-fixture";

const DRY = process.env.DRY === "1";

async function main() {
  const { escaleta, worldBible, data } = buildFix274Fixture();

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
