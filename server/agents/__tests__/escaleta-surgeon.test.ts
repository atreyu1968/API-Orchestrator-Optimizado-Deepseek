// Tests unitarios de la red anti-rebaja del Cirujano de Escaletas (Fix274).
// Ejecutar con: npx tsx server/agents/__tests__/escaleta-surgeon.test.ts
// Calibra detectRevelationDowngrades frente a reformulaciones legítimas
// (sinónimos, orden distinto, hechos ampliados, revelación movida) y
// verifica que las rebajas reales SÍ se detectan.

import { detectRevelationDowngrades } from "../escaleta-surgeon";

let failures = 0;
function check(name: string, cond: boolean, detail?: any) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}

function cap(numero: number, revs: any[]) {
  return { numero, revelaciones_dosificadas: revs };
}
function rev(hecho: string, dificultad = "alta", setup: number[] = []) {
  return { hecho_revelado: hecho, dificultad, setup_capitulos: setup };
}
const NO_PROBLEMS: any[] = [];

// ─── 1. Reformulación legítima con sinónimos / orden distinto ───
console.log("1. Reformulaciones legítimas (sinónimos, orden distinto)");
{
  const casos: Array<[string, string]> = [
    [
      "El mentor traicionó a la orden hace veinte años",
      "Hace veinte años, el mentor fue quien traicionó a la orden",
    ],
    [
      "Lucía descubre que el diario pertenecía a su madre desaparecida",
      "Lucía descubre que el diario era de su madre desaparecida",
    ],
    [
      "El pueblo entero conocía el secreto del faro y guardó silencio",
      "Todo el pueblo conocía el secreto del faro y lo silenció durante décadas",
    ],
    [
      "La carta revela que Martín es el verdadero heredero del título",
      "La carta demuestra que el verdadero heredero del título es Martín",
    ],
  ];
  for (const [orig, ref] of casos) {
    const v = detectRevelationDowngrades(
      [cap(5, [rev(orig, "alta", [2, 3])])],
      [cap(5, [rev(ref, "alta", [2, 3])])],
      NO_PROBLEMS,
    );
    check(`no viola: "${orig.slice(0, 40)}…" reformulada`, v.length === 0, v);
  }
}

// ─── 2. Hecho ampliado (el Cirujano añade detalle) ───
console.log("2. Hecho ampliado / setup ampliado (no viola)");
{
  const v1 = detectRevelationDowngrades(
    [cap(7, [rev("El asesino usó el pasadizo del sótano", "media", [4])])],
    [cap(7, [rev("El asesino usó el pasadizo del sótano que conecta con la biblioteca, sembrado en el cap 4", "media", [4, 5])])],
    NO_PROBLEMS,
  );
  check("hecho ampliado + setup ampliado", v1.length === 0, v1);

  // Dificultad al alza tampoco es rebaja.
  const v2 = detectRevelationDowngrades(
    [cap(7, [rev("El asesino usó el pasadizo del sótano", "media", [4])])],
    [cap(7, [rev("El asesino usó el pasadizo del sótano", "alta", [4])])],
    NO_PROBLEMS,
  );
  check("dificultad subida (media→alta)", v2.length === 0, v2);
}

// ─── 3. Revelación movida de posición dentro del array ───
console.log("3. Revelación movida de posición en el array (no viola)");
{
  const a = rev("El anillo contiene el mapa cifrado de la bóveda", "alta", [3]);
  const b = rev("La condesa financió el motín en secreto", "media", [2]);
  const c = rev("El capitán es hermano bastardo del rey", "alta", [1, 4]);
  const v = detectRevelationDowngrades(
    [cap(9, [a, b, c])],
    [cap(9, [c, a, b])],
    NO_PROBLEMS,
  );
  check("reordenadas sin cambios", v.length === 0, v);
}

// ─── 4. Rebajas reales (SÍ violan) ───
console.log("4. Rebajas reales detectadas");
{
  const v1 = detectRevelationDowngrades(
    [cap(6, [rev("La niña vio al culpable la noche del incendio", "alta", [2, 3])])],
    [cap(6, [rev("La niña vio al culpable la noche del incendio", "baja", [2, 3])])],
    NO_PROBLEMS,
  );
  check("dificultad rebajada alta→baja", v1.length === 1 && /dificultad rebajada/.test(v1[0].motivo), v1);

  const v2 = detectRevelationDowngrades(
    [cap(6, [rev("La niña vio al culpable la noche del incendio", "alta", [2, 3])])],
    [cap(6, [rev("La niña vio al culpable la noche del incendio", "alta", [])])],
    NO_PROBLEMS,
  );
  check("setup_capitulos vaciado", v2.length === 1 && /setup_capitulos vaciado/.test(v2[0].motivo), v2);

  const v3 = detectRevelationDowngrades(
    [cap(6, [rev("La niña vio al culpable la noche del incendio", "alta", [2])])],
    [cap(6, [])],
    NO_PROBLEMS,
  );
  check("revelación eliminada", v3.length === 1 && /eliminada/.test(v3[0].motivo), v3);

  // Sustituida por otra revelación SIN relación = eliminada.
  const v4 = detectRevelationDowngrades(
    [cap(6, [rev("La niña vio al culpable la noche del incendio", "alta", [2])])],
    [cap(6, [rev("El notario falsificó el testamento del abuelo", "alta", [2])])],
    NO_PROBLEMS,
  );
  check("sustituida por otra sin relación", v4.length === 1 && /eliminada/.test(v4[0].motivo), v4);
}

// ─── 5. Rebaja autorizada explícitamente por el problema ───
console.log("5. Rebaja autorizada por la sugerencia del auditor (no viola)");
{
  const v = detectRevelationDowngrades(
    [cap(6, [rev("La niña vio al culpable la noche del incendio", "alta", [2])])],
    [cap(6, [rev("La niña vio al culpable la noche del incendio", "baja", [2])])],
    [{ capitulos: [6], descripcion: "Setup imposible", sugerencia: "añade las siembras o baja la dificultad de la revelación" }],
  );
  check("rebaja autorizada en cap citado", v.length === 0, v);
}

// ─── 6. Reformulación fuerte pero con núcleo compartido ───
console.log("6. Reformulación fuerte con núcleo factual compartido (no viola)");
{
  const casos: Array<[string, string]> = [
    [
      "Elena descubre que su hermana sigue viva y vive oculta en el monasterio",
      "Elena averigua que su hermana no murió: permanece oculta en el monasterio",
    ],
    [
      "El veneno provenía del invernadero privado del doctor Ruiz",
      "El origen del veneno era el invernadero privado del doctor Ruiz",
    ],
  ];
  for (const [orig, ref] of casos) {
    const v = detectRevelationDowngrades(
      [cap(8, [rev(orig, "alta", [5])])],
      [cap(8, [rev(ref, "alta", [5])])],
      NO_PROBLEMS,
    );
    check(`no viola: "${orig.slice(0, 40)}…" reformulada fuerte`, v.length === 0, v);
  }
}

console.log(failures === 0 ? "\nTODOS LOS TESTS PASAN" : `\n${failures} TEST(S) FALLAN`);
process.exit(failures === 0 ? 0 : 1);
