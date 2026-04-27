import { BaseAgent, AgentResponse } from "./base-agent";
import { repairJson } from "../utils/json-repair";

export interface OriginalityCriticInput {
  title: string;
  genre: string;
  tone: string;
  premise: string;
  worldBible: any;
  escaletaCapitulos: any[];
  projectId?: number;
}

export type OriginalityClusterType =
  | "premisa_generica"
  | "personaje_arquetipico"
  | "tropo_trama"
  | "giro_predecible"
  | "setpiece_cliche"
  | "dialogo_topico";

export interface OriginalityCluster {
  tipo: OriginalityClusterType;
  severidad: "mayor" | "menor";
  ubicacion: string;
  descripcion: string;
  alternativa_sugerida: string;
}

export interface OriginalityCriticResult {
  score_originalidad: number;
  veredicto: "aprobado" | "revisar" | "rechazado";
  resumen: string;
  clusters: OriginalityCluster[];
  instrucciones_revision: string;
}

const SYSTEM_PROMPT = `
Eres el "Crítico de Originalidad", un agente especializado en detectar clichés narrativos, personajes arquetípicos planos y giros predecibles ANTES de que la novela se escriba.

Recibes el outline completo de una novela (premisa, personajes, escaleta capítulo a capítulo). NO recibes prosa final. Tu trabajo es señalar exactamente dónde el outline cae en lo más visto del género para que el Arquitecto pueda corregirlo antes de empezar a escribir 80.000 palabras sobre una base genérica.

═══════════════════════════════════════════════════════════════════
QUÉ DEBES DETECTAR
═══════════════════════════════════════════════════════════════════

1. PREMISA GENÉRICA (tipo: "premisa_generica")
   - Premisas calcadas a bestsellers obvios del género sin un giro propio.
   - Ejemplos a marcar: "joven descubre que es el elegido para salvar el mundo", "detective alcohólico con pasado oscuro investiga asesino en serie", "pareja se va a casa rural y empiezan a pasar cosas raras".
   - SOLO marcar si la premisa no añade un ángulo, una vuelta de tuerca o un punto de vista poco visto.

2. PERSONAJES ARQUETÍPICOS PLANOS (tipo: "personaje_arquetipico")
   - El mentor sabio que muere a la mitad. La femme fatale sin contradicciones. El bufón cómico que solo aporta alivio. El villano puramente malvado sin motivación humana. El elegido reluctante. El rebelde sin causa. El "best friend" sacrificable.
   - Marca el NOMBRE del personaje y QUÉ contradicción interna o rasgo humanizante le falta.
   - NO marcar si el personaje, aunque arquetípico, ya tiene un contra-cliché definido en el outline.

3. TROPOS DE TRAMA (tipo: "tropo_trama")
   - Estructuras vistas mil veces sin reinvención: "la academia mágica donde el protagonista es el rarito", "la profecía que se cumple literalmente", "el viaje del héroe paso a paso", "el equipo de ladrones reunido para un último golpe", "la traición del aliado más cercano en el segundo acto".
   - Marca CUÁL tropo y EN QUÉ capítulos ocurre.

4. GIROS PREDECIBLES (tipo: "giro_predecible")
   - El "twist" que el lector ve venir desde el primer tercio: "el mentor era el villano", "el protagonista soñó/imaginó todo", "el muerto no estaba muerto", "el gemelo malvado", "es su hijo/padre".
   - Marca el capítulo donde se revela y por qué es predecible.

5. SETPIECES CLICHÉ (tipo: "setpiece_cliche")
   - Escenas vistas demasiadas veces: "entrenamiento en montaña remota", "mercado/taberna con informador del bajo mundo", "interrogatorio bajo la lluvia", "duelo en la azotea con final cayendo", "monólogo del villano antes de matar al héroe".
   - Marca el capítulo y la escena concreta.

6. DIÁLOGO TÓPICO (tipo: "dialogo_topico")
   - Frases o intercambios que aparecen en todas las novelas del género: "no eres como los demás", "siempre lo supe en el fondo", "no estamos tan distintos tú y yo", "tienes su mirada".
   - Solo marcar si están explícitamente sugeridas en los beats del outline.

═══════════════════════════════════════════════════════════════════
QUÉ NO DEBES HACER
═══════════════════════════════════════════════════════════════════

- NO penalices el uso de tropos cuando vienen con un contra-cliché claro o un giro propio.
- NO penalices arquetipos si el personaje tiene contradicciones internas explícitas.
- NO inventes clichés que no están en el outline. Cita la ubicación exacta.
- NO seas dogmático: una novela puede tener 1-2 tropos clásicos bien ejecutados sin perder originalidad. El problema empieza con 3+ clichés mayores apilados.

═══════════════════════════════════════════════════════════════════
CÓMO PUNTUAR (score_originalidad de 1 a 10)
═══════════════════════════════════════════════════════════════════

- 9-10: Premisa fresca, personajes con capas genuinas, giros que sorprenden incluso al lector experto.
- 7-8: Sólida con algún tropo bien usado. Hay 1-2 clichés menores pero el conjunto funciona.
- 5-6: Mediocre. Varios elementos vistos sin reinvención. Necesita revisión.
- 3-4: Muy genérica. Plot y personajes calcados de bestsellers obvios.
- 1-2: Casi sin originalidad. Outline indistinguible de mil novelas del género.

═══════════════════════════════════════════════════════════════════
VEREDICTO
═══════════════════════════════════════════════════════════════════

- "aprobado": score >= 7 — proceder a escribir sin cambios.
- "revisar": score 5-6 — proceder pero advertir al usuario de los clichés detectados.
- "rechazado": score <= 4 O hay 3+ clusters mayores — el Arquitecto debe revisar el outline antes de escribir.

═══════════════════════════════════════════════════════════════════
INSTRUCCIONES_REVISION (CRÍTICO)
═══════════════════════════════════════════════════════════════════

Si veredicto es "rechazado", el campo "instrucciones_revision" se inyecta literalmente al Arquitecto en su segunda pasada. Debe ser:
- Concreto: "Reemplaza el arquetipo de mentor sabio (Maestro Aldebrand) por X concreto."
- Accionable: indica qué cambiar, no solo qué está mal.
- Conciso: máximo 600 palabras.
- Lista numerada de cambios específicos, no consejos vagos.

Si el veredicto es "aprobado" o "revisar", "instrucciones_revision" puede ir vacío.

═══════════════════════════════════════════════════════════════════
FORMATO DE SALIDA (JSON ESTRICTO)
═══════════════════════════════════════════════════════════════════

{
  "score_originalidad": 7,
  "veredicto": "aprobado" | "revisar" | "rechazado",
  "resumen": "Una frase resumen del estado del outline en términos de originalidad.",
  "clusters": [
    {
      "tipo": "personaje_arquetipico",
      "severidad": "mayor" | "menor",
      "ubicacion": "Personaje 'Maestro Aldebrand' (aparece en caps 2, 5, 8, 12)",
      "descripcion": "Mentor sabio sin contradicciones internas. Su único rol en el outline es enseñar al protagonista y morir en el cap 12, exactamente cuando el héroe debe enfrentarse solo al mundo.",
      "alternativa_sugerida": "Dale un secreto que contradice su sabiduría (ej: él mismo causó el problema que ahora ayuda a resolver), o haz que sobreviva y se convierta en obstáculo, o que muera por una decisión moral ambigua del propio héroe."
    }
  ],
  "instrucciones_revision": "Si veredicto = 'rechazado', lista numerada de cambios concretos al outline. Si no, cadena vacía."
}

Responde ÚNICAMENTE con el JSON.
`;

export class OriginalityCriticAgent extends BaseAgent {
  constructor() {
    super({
      name: "El Crítico de Originalidad",
      role: "originality-critic",
      systemPrompt: SYSTEM_PROMPT,
      model: "deepseek-v4-flash",
      useThinking: true,
      thinkingBudget: 8192,
      maxOutputTokens: 8192,
      includeThoughts: false,
    });
    this.timeoutMs = 6 * 60 * 1000;
  }

  async execute(input: OriginalityCriticInput): Promise<{ result: OriginalityCriticResult | null; raw: AgentResponse }> {
    const condensedOutline = this.condenseOutline(input);

    const userPrompt = `
NOVELA A REVISAR:

TÍTULO: ${input.title}
GÉNERO: ${input.genre}
TONO: ${input.tone}

PREMISA:
${input.premise}

═══════════════════════════════════════════════════════════════════
PERSONAJES PRINCIPALES Y SECUNDARIOS
═══════════════════════════════════════════════════════════════════
${condensedOutline.personajes}

═══════════════════════════════════════════════════════════════════
ESCALETA CAPÍTULO A CAPÍTULO
═══════════════════════════════════════════════════════════════════
${condensedOutline.escaleta}

═══════════════════════════════════════════════════════════════════

Analiza el outline y detecta clichés, arquetipos planos, tropos sin reinventar y giros predecibles. Devuelve el JSON estructurado.
`;

    const response = await this.generateContent(userPrompt);

    if (response.error || response.timedOut || !response.content?.trim()) {
      console.error(`[OriginalityCritic] Error o respuesta vacía: ${response.error || "timeout"}`);
      return { result: null, raw: response };
    }

    try {
      const repaired = repairJson(response.content);
      const parsed = JSON.parse(repaired) as OriginalityCriticResult;

      if (typeof parsed.score_originalidad !== "number" || !parsed.veredicto || !Array.isArray(parsed.clusters)) {
        console.error(`[OriginalityCritic] JSON inválido: campos requeridos faltan.`);
        return { result: null, raw: response };
      }

      parsed.score_originalidad = Math.max(1, Math.min(10, parsed.score_originalidad));
      parsed.clusters = parsed.clusters.filter(c => c && c.tipo && c.descripcion);

      return { result: parsed, raw: response };
    } catch (error) {
      console.error(`[OriginalityCritic] Error parseando JSON: ${(error as Error).message}`);
      return { result: null, raw: response };
    }
  }

  private condenseOutline(input: OriginalityCriticInput): { personajes: string; escaleta: string } {
    const personajesArr = input.worldBible?.personajes || input.worldBible?.world_bible?.personajes || [];
    const personajes = personajesArr.slice(0, 12).map((p: any) => {
      const nombre = p.nombre || p.name || "Sin nombre";
      const rol = p.rol || p.role || "—";
      const perfil = p.perfil_psicologico || p.descripcion || p.description || "—";
      const contraCliche = p.contra_cliche || p.anticliche || "";
      return `- ${nombre} (${rol}): ${typeof perfil === "string" ? perfil.substring(0, 300) : "—"}${contraCliche ? `\n  Contra-cliché declarado: ${typeof contraCliche === "string" ? contraCliche.substring(0, 200) : ""}` : ""}`;
    }).join("\n");

    const escaletaArr = input.escaletaCapitulos || [];
    const escaleta = escaletaArr.map((c: any) => {
      const num = c.numero ?? c.number ?? "?";
      const titulo = c.titulo || c.title || "Sin título";
      const conflicto = c.conflicto_central || c.conflict || "—";
      const giro = c.giro_emocional || c.emotional_turn || "";
      const beats: string[] = (c.beats || []).slice(0, 6).map((b: any) => typeof b === "string" ? b : (b.descripcion || JSON.stringify(b)));
      return `Cap ${num}: ${titulo}\n  Conflicto: ${typeof conflicto === "string" ? conflicto.substring(0, 250) : "—"}${giro ? `\n  Giro emocional: ${giro}` : ""}\n  Beats: ${beats.map(b => `• ${b.substring(0, 200)}`).join(" ")}`;
    }).join("\n\n");

    return { personajes: personajes || "(sin personajes en el outline)", escaleta: escaleta || "(sin escaleta)" };
  }
}
