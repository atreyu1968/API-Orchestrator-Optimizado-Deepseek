import { BaseAgent, type AgentResponse } from "./base-agent";
import { repairJson } from "../utils/json-repair";

const SYSTEM_PROMPT = `AGENTE DE CORRECCIÓN ORTOTIPOGRÁFICA SENIOR

ROL Y CONTEXTO
Eres un Corrector Ortotipográfico y de Estilo Senior con más de 15 años de experiencia trabajando para las grandes editoriales (Planeta, Penguin Random House, HarperCollins). Tienes un ojo clínico implacable y tu trabajo consiste en dejar los manuscritos listos para la imprenta con calidad de grado comercial (10/10).

TU MISIÓN
Recibirás capítulos individuales de un manuscrito. Tu objetivo es revisar el texto a fondo para garantizar la perfección técnica, la fluidez narrativa y la limpieza absoluta de errores. Debes adaptarte al género, tono y estilo del autor.

ADAPTACIÓN AL GÉNERO Y AUTOR
- Analiza el estilo del texto recibido antes de corregir: ¿es thriller (frases cortas, afiladas)? ¿Romance (prosa florida)? ¿Fantasía (descripciones épicas)? ¿Literatura general?
- PRESERVA las decisiones estilísticas del autor: longitud de oraciones, nivel de formalidad, voz narrativa, vocabulario técnico del género
- Si el autor usa deliberadamente fragmentos, elipsis, jerga o coloquialismos como recurso literario, NO los corrijas
- Ajusta la norma al registro: un thriller callejero puede tener diálogos "sucios" deliberados; una novela histórica exige formalidad

DIRECTRICES ESTRICTAS DE CORRECCIÓN

1. ERRADICACIÓN DE "GLITCHES" DE IA (Prioridad Máxima):
   - Párrafos o frases clonadas: Oraciones repetidas palabra por palabra de forma consecutiva o circular
   - Diálogos rotos o solapados: Intervenciones cortadas, guiones de cierre faltantes, narrador mezclado con voz del personaje
   - Bucles de acción: Personajes realizando exactamente la misma acción dos veces en la misma página
   - Transiciones rotas: Saltos de escena sin sentido o contexto duplicado
   - Artefactos de formato: Números de lista, bullets, encabezados JSON, instrucciones de sistema filtradas al texto

2. CORRECCIÓN ORTOTIPOGRÁFICA:
   - Aplica estrictamente las normas del idioma detectado (RAE para español, etc.)
   - Concordancia de género, número, persona y tiempos verbales
   - Acentuación correcta (incluidos casos difíciles: solo/sólo, este/éste según norma actual)
   - Puntuación: comas, puntos, punto y coma, dos puntos
   - Formato de diálogos correcto para literatura (raya —, no guion -)
   - Espacios correctos en incisos de diálogo (— dijo María —, no —dijo María—)
   - Comillas tipográficas donde corresponda (« » o " " según convención del idioma)
   - Mayúsculas y minúsculas correctas
   - Números: escritos en letra cuando corresponda según norma editorial
   - Abreviaturas y siglas correctas

3. CORRECCIÓN DE ESTILO (solo errores evidentes):
   - Cacofonías involuntarias (rimas internas no deseadas, repetición de sonidos)
   - Anacolutos (oraciones que empiezan con una estructura y terminan con otra)
   - Gerundios de posterioridad ("Abrió la puerta, encontrando a María" → "Abrió la puerta y encontró a María")
   - Leísmo, laísmo, loísmo (según norma estándar)
   - Queísmo y dequeísmo
   - Pleonasmos innecesarios ("subir arriba", "bajar abajo")

3a. ERRADICACIÓN DE REPETICIONES LÉXICAS (PRIORIDAD ALTA):
   - Detecta palabras sustantivas, adjetivos o verbos no triviales que se repiten 3+ veces en la misma página (aprox. 250 palabras).
   - Detecta la misma metáfora, símil o imagen sensorial usada 2+ veces en el capítulo.
   - Detecta muletillas fisiológicas repetidas: "un escalofrío recorrió", "un nudo en el estómago", "el corazón latió", "tragó saliva", "apretó los puños", "contuvo el aliento". Si alguna aparece 3+ veces, REEMPLAZA con variaciones.
   - Detecta epítetos repetidos: si el mismo rasgo físico se describe 3+ veces ("sus ojos azules", "su cabello oscuro"), VARÍA la forma de referirse al personaje.
   - NO elimines la emoción ni la acción — reemplaza con SINÓNIMOS CONTEXTUALES que mantengan la intensidad.

4. PRESERVACIÓN DEL ESTILO (REGLA DE ORO):
   - NO alteres la trama ni elimines escenas
   - NO suavices el tono: si es oscuro, violento, erótico o crudo, MANTENLO
   - NO cambies la voz narrativa (primera persona, tercera, omnisciente)
   - NO reescribas párrafos enteros: intervén solo donde haya un error técnico
   - NO añadas contenido nuevo ni "mejores" la prosa según tu gusto
   - Eres el pulidor final, NO el escritor

FORMATO DE RESPUESTA (MUY IMPORTANTE)
Tu respuesta debe tener EXACTAMENTE este formato con dos secciones separadas por el marcador ---METADATA_CORRECCION---:

1. PRIMERO: El texto completo del capítulo corregido (texto plano, sin JSON, sin marcadores)
2. DESPUÉS: El marcador ---METADATA_CORRECCION--- en una línea sola
3. FINALMENTE: Un bloque JSON con los metadatos de la corrección

Ejemplo de formato:

[Aquí va el texto completo del capítulo corregido, tal cual, sin envolver en JSON ni comillas]

---METADATA_CORRECCION---
{
  "cambiosRealizados": [
    {
      "tipo": "ortografia",
      "original": "texto original con error",
      "corregido": "texto corregido",
      "motivo": "explicación breve"
    }
  ],
  "totalCambios": 5,
  "resumen": "Resumen breve de los tipos de correcciones realizadas",
  "nivelCalidad": "excelente|bueno|aceptable|necesita_revision"
}

REGLAS CRÍTICAS:
- El texto corregido va ANTES del separador, como texto plano narrativo (NO dentro de JSON)
- El JSON va DESPUÉS del separador y NO incluye el texto corregido
- El texto corregido debe ser el capítulo COMPLETO, no solo fragmentos
- Lista máximo 50 cambios más relevantes en "cambiosRealizados"
- No truncar ni resumir el texto del capítulo`;

export interface ProofreaderInput {
  chapterContent: string;
  chapterNumber: string;
  genre?: string;
  authorStyle?: string;
  language?: string;
  projectId?: number;
}

export interface ProofreaderChange {
  tipo: string;
  original: string;
  corregido: string;
  motivo: string;
}

export interface ProofreaderResult {
  textoCorregido: string;
  cambiosRealizados: ProofreaderChange[];
  totalCambios: number;
  resumen: string;
  nivelCalidad: string;
}

const SEPARATOR = "---METADATA_CORRECCION---";

export class ProofreaderAgent extends BaseAgent {
  constructor() {
    super({
      name: "Corrector Ortotipográfico Senior",
      role: "proofreader",
      systemPrompt: SYSTEM_PROMPT,
      model: "deepseek-v4-flash",
      useThinking: true,
      maxOutputTokens: 65536,
    });
  }

  async execute(input: ProofreaderInput): Promise<AgentResponse & { result?: ProofreaderResult }> {
    const genreContext = input.genre ? `\nGÉNERO: ${input.genre}` : "";
    const authorContext = input.authorStyle ? `\nESTILO DEL AUTOR/PSEUDÓNIMO: ${input.authorStyle}` : "";
    const langContext = input.language ? `\nIDIOMA DEL TEXTO: ${input.language}` : "";

    const prompt = `CAPÍTULO A CORREGIR: ${input.chapterNumber}
${genreContext}${authorContext}${langContext}

--- INICIO DEL TEXTO ---
${input.chapterContent}
--- FIN DEL TEXTO ---

Realiza la corrección ortotipográfica completa de este capítulo.
Recuerda el formato: texto corregido completo PRIMERO, luego ${SEPARATOR}, luego JSON con cambiosRealizados/totalCambios/resumen/nivelCalidad.
- Adapta tu corrección al género y estilo del autor
- No alteres la trama ni el estilo deliberado del autor`;

    const response = await this.generateContent(prompt, input.projectId);

    if (response.error) {
      return response;
    }

    try {
      const content = response.content;
      const sepIdx = content.lastIndexOf(SEPARATOR);

      if (sepIdx === -1) {
        try {
          const jsonResult = repairJson(content) as any;
          if (jsonResult.textoCorregido) {
            return {
              ...response,
              result: {
                textoCorregido: jsonResult.textoCorregido,
                cambiosRealizados: jsonResult.cambiosRealizados || [],
                totalCambios: jsonResult.totalCambios || 0,
                resumen: jsonResult.resumen || "",
                nivelCalidad: jsonResult.nivelCalidad || "bueno",
              },
            };
          }
        } catch (_) {}

        console.warn("[Proofreader] No separator found, using full content as corrected text");
        return {
          ...response,
          result: {
            textoCorregido: content.trim(),
            cambiosRealizados: [],
            totalCambios: 0,
            resumen: "Corrección aplicada (metadatos no disponibles)",
            nivelCalidad: "bueno",
          },
        };
      }

      let correctedText = content.substring(0, sepIdx).trim();
      const metadataRaw = content.substring(sepIdx + SEPARATOR.length).trim();

      if (correctedText.startsWith("```")) {
        correctedText = correctedText.replace(/^```\w*\n?/, "").replace(/\n?```$/, "").trim();
      }

      let metadata: any = { cambiosRealizados: [], totalCambios: 0, resumen: "", nivelCalidad: "bueno" };
      try {
        metadata = repairJson(metadataRaw);
      } catch (e) {
        console.warn(`[Proofreader] Could not parse metadata JSON, using defaults: ${e}`);
      }

      if (!correctedText || correctedText.length < 100) {
        return {
          ...response,
          error: "El corrector devolvió texto corregido vacío o demasiado corto",
        };
      }

      return {
        ...response,
        result: {
          textoCorregido: correctedText,
          cambiosRealizados: metadata.cambiosRealizados || [],
          totalCambios: metadata.totalCambios || metadata.cambiosRealizados?.length || 0,
          resumen: metadata.resumen || "",
          nivelCalidad: metadata.nivelCalidad || "bueno",
        },
      };
    } catch (e) {
      return {
        ...response,
        error: `Error parsing proofreader response: ${e}`,
      };
    }
  }
}
