// [Fix177] Registro en memoria de los pulidos advisory (Holistico+Beta)
// actualmente en ejecucion en ESTE proceso. Es el guard de exclusion COMPARTIDO
// entre los dos puntos de entrada del bucle:
//   - finalizeCompletedProject (orquestador normal, al terminar la novela)
//   - polish-auto-resume (reanudacion en arranque + rescate manual via endpoint)
// Sin este registro comun, un /resume-polish disparado mientras el bucle ya
// corre lanzaria un SEGUNDO bucle sobre el mismo proyecto -> doble gasto de
// tokens + escrituras concurrentes de capitulos/scores/logs.
//
// Deploy single-instance (systemd) + dev Replit: un Set en memoria de proceso
// basta. Si algun dia se escala a multi-instancia habria que sustituirlo por un
// lock atomico en BD (compare-and-set por proyecto).
const activePolishProjects = new Set<number>();

// Adquisicion ATOMICA del lock: check + set en una sola operacion sincrona (sin
// await en medio). En el event-loop de Node esto es indivisible, asi que dos
// llamadas concurrentes (p.ej. dos POST /resume-polish del mismo proyecto) no
// pueden pasar ambas: solo la primera obtiene true y arranca el bucle. Es el
// unico gate valido; un isPolishActive() + set posterior con awaits entre medias
// tiene ventana TOCTOU y NO sirve como candado.
export function tryMarkPolishActive(projectId: number): boolean {
  if (activePolishProjects.has(projectId)) return false;
  activePolishProjects.add(projectId);
  return true;
}

export function clearPolishActive(projectId: number): void {
  activePolishProjects.delete(projectId);
}

// Solo para fast-path/lectura (logs, rechazo temprano). NO usar como candado: el
// gate real es tryMarkPolishActive.
export function isPolishActive(projectId: number): boolean {
  return activePolishProjects.has(projectId);
}

// [Fix195] Peticiones de PARADA del bucle de pulido. Antes no existia forma de
// detener un pulido en marcha (solo matar el proceso). El bucle consulta esta
// bandera entre iteraciones (nunca a mitad de una lectura/cirugia) y cierra
// limpio conservando la mejor version. La bandera se limpia al consumirse o al
// terminar el bucle por cualquier via.
const stopRequestedProjects = new Set<number>();

export function requestPolishStop(projectId: number): void {
  stopRequestedProjects.add(projectId);
}

export function isPolishStopRequested(projectId: number): boolean {
  return stopRequestedProjects.has(projectId);
}

export function clearPolishStopRequest(projectId: number): void {
  stopRequestedProjects.delete(projectId);
}
