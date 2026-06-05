import { Orchestrator } from "../server/orchestrator";

const fn = (Orchestrator.prototype as any).buildLivingSeedGuidance as (
  escaleta: any[],
  cap: number,
  total: number,
) => string;
const call = (escaleta: any[], cap: number, total: number) => fn.call({}, escaleta, cap, total);

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: string) {
  if (cond) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}${extra ? ` -> ${extra}` : ""}`);
  }
}

// 1) Entradas vacías / inválidas => ""
check("vacío => ''", call([], 3, 10) === "");
check("no-array => ''", call(null as any, 3, 10) === "");

// 2) Cross-capítulo: siembra en cap1 sin cosechar => promesa abierta en cap3
const escA = [
  { numero: 1, siembra: ["sA"], cosecha: [] },
  { numero: 2, siembra: ["sB"], cosecha: [] },
  { numero: 3, siembra: [], cosecha: [] },
];
const outA = call(escA, 3, 10);
check("cap3 lista sA y sB como abiertas", outA.includes("sA") && outA.includes("sB") && outA.includes("PROMESAS/SEMILLAS ABIERTAS"), outA);

// 3) Cosecha paga la promesa: sA cosechada en cap2 => NO abierta en cap3
const escB = [
  { numero: 1, siembra: ["sA"], cosecha: [] },
  { numero: 2, siembra: [], cosecha: ["sA"] },
  { numero: 3, siembra: [], cosecha: [] },
];
const outB = call(escB, 3, 10);
check("sA pagada en cap2 no aparece abierta en cap3", !outB.includes("sA"), outB);

// 4) Sembrar/pagar del capítulo actual
const escC = [
  { numero: 5, siembra: ["semNueva"], cosecha: ["pagoAqui"] },
];
const outC = call(escC, 5, 10);
check("cap actual: SEMBRAR muestra siembra", outC.includes("SEMBRAR/ESTABLECER") && outC.includes("semNueva"), outC);
check("cap actual: PAGAR muestra cosecha", outC.includes("PAGAR/COSECHAR") && outC.includes("pagoAqui"), outC);

// 5) Dedup case-insensitive de promesas abiertas
const escD = [
  { numero: 1, siembra: ["SemillaA"], cosecha: [] },
  { numero: 2, siembra: ["semillaa"], cosecha: [] },
  { numero: 3, siembra: [], cosecha: [] },
];
const outD = call(escD, 3, 10);
// El id normaliza a "semillaa" (doble a); la cabecera dice "SEMILLAS" (sin doble
// a), así que /semillaa/gi cuenta solo las entradas listadas, no la cabecera.
const dupCount = (outD.match(/semillaa/gi) || []).length;
check("dedup case-insensitive (una sola entrada)", dupCount === 1, `count=${dupCount} :: ${outD}`);

// 6) Último cuarto escala el aviso (cap 8 de 10, con promesa abierta)
const escE = [
  { numero: 1, siembra: ["sX"], cosecha: [] },
  { numero: 8, siembra: [], cosecha: [] },
];
const outE = call(escE, 8, 10);
check("último cuarto: aviso escalado", outE.includes("ÚLTIMO CUARTO"), outE);

// 7) Prólogo (numero 0) y epílogo (numero -1) no rompen ni disparan 'último cuarto'
const escF = [
  { numero: 0, siembra: ["prologoSeed"], cosecha: [] },
  { numero: 1, siembra: [], cosecha: [] },
  { numero: -1, siembra: [], cosecha: ["prologoSeed"] },
];
const outProl = call(escF, 0, 10);
check("prólogo no lanza ni mete 'último cuarto'", !outProl.includes("ÚLTIMO CUARTO"), outProl);
const outEpi = call(escF, -1, 10);
check("epílogo cosecha prologoSeed: no queda abierta", !outEpi.includes("PROMESAS/SEMILLAS ABIERTAS"), outEpi);

// 8) Sin nada que recordar => ""
const escG = [{ numero: 4, siembra: [], cosecha: [] }];
check("cap sin semillas => ''", call(escG, 4, 10) === "");

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
