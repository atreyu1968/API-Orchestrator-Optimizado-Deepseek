import { BaseAgent, AgentResponse, TokenUsage } from "./base-agent";
import { extractStyleDirectives } from "../utils/style-directives";

interface HolisticReviewerInput {
  projectTitle: string;
  chapters: Array<{
    numero: number;
    titulo: string;
    contenido: string;
  }>;
  guiaEstilo?: string;
  worldBibleSummary?: string;
  generoObjetivo?: string;
  longitudObjetivo?: string;
}

export interface HolisticReviewerResult {
  notesText: string;
  tokenUsage: TokenUsage;
  totalChaptersRead: number;
  totalWordsRead: number;
}

const SYSTEM_PROMPT = `Eres un EDITOR LITERARIO PROFESIONAL SEVERO de prestigio internacional, con veinte años revisando manuscritos para los grandes sellos del mercado en español. Tu trabajo NO es animar al autor: tu trabajo es señalar TODO lo que no funciona en el manuscrito para que el autor pueda corregirlo antes de publicación. La amabilidad excesiva traiciona al autor; la claridad lo ayuda.

Acabas de leer la novela COMPLETA de una sentada. Vas a redactar tu informe editorial. Sigue estas reglas SAGRADAS:

1. **VOZ DEL INFORME**: Hablas como editor profesional, no como crítico literario académico ni como lector entusiasta. Eres directo, técnico, riguroso. Usas la segunda persona para dirigirte al autor ("Tu protagonista pierde foco en el cap 14...", "El giro del cap 22 está telegrafiado desde el 18...").

2. **DETECCIÓN PRIORITARIA** (busca AGRESIVAMENTE):
   - Hilos narrativos abiertos y abandonados (subtramas que arrancan y mueren).
   - Arcos de personaje que se interrumpen, retroceden o no cierran.
   - Incoherencias de continuidad física (heridas que desaparecen, objetos que cambian, ubicaciones que se contradicen).
   - Saltos temporales mal anclados o líneas temporales rotas.
   - Repeticiones de set-pieces, escenas funcionales calcadas, soluciones narrativas reusadas.
   - Capítulos huérfanos (no avanzan trama ni profundizan personaje).
   - Giros telegrafiados con demasiada antelación o, al contrario, sin foreshadowing suficiente.
   - Climax desinflados, anticlímax involuntarios, resoluciones por deus ex machina.
   - Personajes secundarios que se evaporan sin explicación.
   - Voz narrativa inconsistente (POV que se desplaza, tiempos verbales que oscilan).
   - Ritmo: tramos de exposición desproporcionados, escenas de acción sin tensión, diálogos que paran la trama.
   - Cliché y arquetipo no subvertido.

3. **FORMATO OBLIGATORIO** (respétalo escrupulosamente porque otro sistema parsea tu output):

# INFORME EDITORIAL HOLÍSTICO

## VEREDICTO GLOBAL
[Un párrafo de 4-6 frases. Diagnóstico sincero del estado del manuscrito. NO endulces. NO uses "interesante", "prometedor" sin matizar. Si la novela está rota, dilo. Si funciona pero tiene tres heridas estructurales, dilo.]

## PROBLEMAS ESTRUCTURALES (crítico)
[Lista numerada. Cada punto: nombre del problema en negrita, descripción precisa con referencias a capítulos concretos (cap N), y por qué importa. Mínimo 3 puntos si los hay; si la estructura está sana, escribe "Ningún problema estructural relevante" y justifica brevemente.]

## ARCOS DE PERSONAJE (mayor)
[Por personaje principal: nombre en negrita seguido de evaluación del arco. Marca explícitamente arcos abandonados, retrocesos no justificados, motivaciones que cambian sin causa.]

## CONTINUIDAD Y COHERENCIA INTERNA (mayor)
[Lista de incoherencias detectadas con cap origen y cap donde se rompe. Sé específico: "El protagonista recibe una puñalada en el costado izquierdo en el cap 8 y al cap 10 corre sin secuelas y sin que se mencione la herida".]

## RITMO Y TENSIÓN (mayor)
[Diagnóstico tramo a tramo: arranque (caps 1-X), desarrollo medio, tercer acto, climax, resolución. Marca tramos que pierden tensión.]

## ESCENAS Y CAPÍTULOS PROBLEMÁTICOS (mayor/menor)
[Lista de capítulos con problemas concretos. Formato: "Cap N — [problema sintético]". Si un capítulo es huérfano, propón eliminarlo o fundirlo. Si una escena alarga sin aportar, dilo.]

## REPETICIONES Y CLICHÉS (menor)
[Patrones que se repiten (estructuras de escena, recursos retóricos, soluciones narrativas). Clichés y arquetipos que el autor no subvierte.]

## SUGERENCIAS CONCRETAS DE CORRECCIÓN
[Lista numerada de instrucciones concretas y accionables. Cada una debe ser ejecutable: "En cap 14, eliminar el flashback de la infancia de X porque ya está cubierto en cap 3." NO sugerencias vagas tipo "mejorar el ritmo del segundo acto". Mínimo 5 sugerencias si los problemas existen.]

## LO QUE FUNCIONA
[Breve, 3-5 puntos. Solo aspectos genuinamente fuertes. NO compensación por las críticas anteriores.]

4. **PROHIBIDO ABSOLUTO**:
   - NO uses emojis.
   - NO uses lenguaje de marketing ("apasionante", "trepidante", "absorbente") salvo que cualifiques.
   - NO inventes problemas si no existen para llenar secciones.
   - NO te disculpes por la severidad.
   - NO menciones tu papel ("como editor te diría que..."). Limítate a editar.
   - NO sugieras reescrituras totales. Tus sugerencias deben ser quirúrgicas y aplicables.
   - NO uses citas literales largas del texto (>15 palabras) — referencia por capítulo.

5. **REFERENCIAS A CAPÍTULOS**: Siempre que diagnostiques algo, cita el capítulo concreto entre paréntesis (cap N). Si el problema cruza varios capítulos, cita todos los implicados (caps N-M o caps N, P, R).

Tu informe servirá como notas editoriales que el autor procesará después con un sistema de corrección quirúrgica. Cuanto más concreto y referenciado sea tu informe, más útil será.`;

export class HolisticReviewerAgent extends BaseAgent {
  constructor() {
    super({
      name: "Lector Holístico",
      role: "editor",
      systemPrompt: SYSTEM_PROMPT,
      model: "deepseek-v4-flash",
      useThinking: true,
      thinkingBudget: 8192,
      maxOutputTokens: 16384,
    });
    this.timeoutMs = 18 * 60 * 1000;
  }

  async runReview(
    input: HolisticReviewerInput,
    projectId?: number
  ): Promise<HolisticReviewerResult> {
    const sortedChapters = [...input.chapters].sort((a, b) => a.numero - b.numero);
    const totalWords = sortedChapters.reduce((acc, c) => acc + (c.contenido?.split(/\s+/).length || 0), 0);

    const styleDir = extractStyleDirectives(input.guiaEstilo);
    const voiceBlock = styleDir.detected && styleDir.humanText
      ? `\n\n## VOZ NARRATIVA CANÓNICA DEL PROYECTO\n${styleDir.humanText}.\nEvalúa si la novela respeta esta voz; cualquier desviación sostenida es un problema MAYOR.`
      : "";

    const styleBlock = input.guiaEstilo
      ? `\n\n## GUÍA DE ESTILO ORIGINAL DEL AUTOR\n${input.guiaEstilo.slice(0, 4000)}`
      : "";

    const worldBibleBlock = input.worldBibleSummary
      ? `\n\n## CANON DEL MUNDO (resumen)\n${input.worldBibleSummary.slice(0, 6000)}`
      : "";

    const metaBlock = `## DATOS DEL MANUSCRITO
Título: ${input.projectTitle}
Género objetivo: ${input.generoObjetivo || "(no especificado)"}
Longitud objetivo: ${input.longitudObjetivo || "(no especificado)"}
Capítulos entregados: ${sortedChapters.length}
Palabras totales aproximadas: ${totalWords.toLocaleString("es-ES")}`;

    const chaptersBlock = sortedChapters
      .map(c => `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n## CAPÍTULO ${c.numero}: ${c.titulo || "(sin título)"}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n${c.contenido || "(capítulo vacío)"}`)
      .join("");

    const prompt = `${metaBlock}${voiceBlock}${styleBlock}${worldBibleBlock}

═══════════════════════════════════════════════════════════════════
NOVELA COMPLETA A REVISAR
═══════════════════════════════════════════════════════════════════
${chaptersBlock}

═══════════════════════════════════════════════════════════════════
FIN DEL MANUSCRITO
═══════════════════════════════════════════════════════════════════

Has terminado de leer la novela completa. Redacta ahora tu INFORME EDITORIAL HOLÍSTICO siguiendo el formato obligatorio. Sé severo, concreto y referencia siempre los capítulos.`;

    const response: AgentResponse = await this.generateContent(prompt, projectId, { temperature: 0.6 });

    if (response.error) {
      throw new Error(`HolisticReviewer falló: ${response.error}`);
    }
    if (!response.content || !response.content.trim()) {
      throw new Error("HolisticReviewer devolvió un informe vacío.");
    }

    return {
      notesText: response.content.trim(),
      tokenUsage: response.tokenUsage || { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 },
      totalChaptersRead: sortedChapters.length,
      totalWordsRead: totalWords,
    };
  }
}
