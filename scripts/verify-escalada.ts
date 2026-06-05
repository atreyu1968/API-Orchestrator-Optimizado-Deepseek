import { runArchitectStructuralAudits } from "../server/agents/scene-shape-auditor";

function makeEscaleta(act2Apuestas: string[]): any[] {
  // 12 capítulos: act2 = caps 4..9 (6 caps). Resto en "media" para
  // coverage 100% (evita ruido de apuesta_dramatica_ausente).
  const caps: any[] = [];
  for (let n = 1; n <= 12; n++) {
    let ap = "media";
    if (n >= 4 && n <= 9) ap = act2Apuestas[n - 4] ?? "media";
    caps.push({
      numero: n,
      titulo: `Cap ${n}`,
      sinopsis: "x",
      objetivo_narrativo: "x",
      apuesta_dramatica: ap,
    });
  }
  return caps;
}

function buclesDe(escaleta: any[]): number {
  const res = runArchitectStructuralAudits(escaleta, {});
  return res.problemas.filter(
    (p: any) => p.area === "escalada_acto2" && p.tipo === "bucle_sin_escalada"
  ).length;
}

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, extra?: string) => {
  if (cond) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}${extra ? ` -> ${extra}` : ""}`);
  }
};

// A) CONTROL POSITIVO (tolerar): tensión alta sostenida no es bucle.
const a = buclesDe(makeEscaleta(["alta", "alta", "alta", "critica", "critica", "critica"]));
check("tensión alta/critica sostenida NO marca bucle", a === 0, `bucles=${a}`);

// B) CONTROL NEGATIVO (penalizar): meseta baja sí es bucle.
const b = buclesDe(makeEscaleta(["media", "media", "media", "media", "media", "media"]));
check("meseta en 'media' SÍ marca bucle", b >= 1, `bucles=${b}`);

// C) CONTROL POSITIVO: descenso desde el pico (respiro) no es bucle.
const c = buclesDe(makeEscaleta(["critica", "critica", "alta", "alta", "media", "media"]));
check("descenso desde 'critica' NO marca bucle", c === 0, `bucles=${c}`);

// D) CONTROL NEGATIVO: estancamiento bajo y decreciente sí es bucle.
const d = buclesDe(makeEscaleta(["media", "media", "baja", "baja", "baja", "baja"]));
check("estancamiento bajo/decreciente SÍ marca bucle", d >= 1, `bucles=${d}`);

// E) CONTROL POSITIVO: pico al final (sube y se sostiene arriba) no es bucle.
const e = buclesDe(makeEscaleta(["media", "alta", "alta", "critica", "critica", "critica"]));
check("subida hacia el clímax sostenida NO marca bucle", e === 0, `bucles=${e}`);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
