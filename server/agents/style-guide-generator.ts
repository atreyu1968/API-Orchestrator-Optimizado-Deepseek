import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

interface GenerateGuideParams {
  guideType: "author_style" | "idea_writing" | "pseudonym_style" | "series_writing";
  authorName?: string;
  idea?: string;
  genre?: string;
  tone?: string;
  pseudonymName?: string;
  pseudonymBio?: string;
  pseudonymGenre?: string;
  pseudonymTone?: string;
  existingStyleGuides?: string[];
  seriesTitle?: string;
  seriesDescription?: string;
  seriesTotalBooks?: number;
  seriesWorkType?: string;
  language?: string;
}

interface GenerateGuideResult {
  title: string;
  content: string;
  inputTokens: number;
  outputTokens: number;
}

function buildSystemPrompt(params: GenerateGuideParams): string {
  const lang = params.language || "es";
  const langInstructions = lang === "es"
    ? "Genera toda la guía en ESPAÑOL."
    : lang === "en" ? "Generate the entire guide in ENGLISH."
    : lang === "fr" ? "Génère tout le guide en FRANÇAIS."
    : lang === "de" ? "Erstelle den gesamten Leitfaden auf DEUTSCH."
    : lang === "it" ? "Genera tutta la guida in ITALIANO."
    : lang === "pt" ? "Gere todo o guia em PORTUGUÊS."
    : lang === "ca" ? "Genera tota la guia en CATALÀ."
    : "Genera toda la guía en ESPAÑOL.";

  const baseRole = `Eres un experto en análisis literario, teoría narrativa y craft de escritura creativa con profundo conocimiento de estilos autoriales, técnicas narrativas y convenciones de género.`;

  switch (params.guideType) {
    case "author_style":
      return `${baseRole}

Tu tarea es crear una GUÍA DE ESTILO DETALLADA basada en el estilo literario de ${params.authorName}.
${params.genre ? `Género de referencia: ${params.genre}` : ''}

La guía debe cubrir TODOS estos apartados con profundidad:

1. **VOZ NARRATIVA Y TONO**
   - Tipo de narrador predominante (primera persona, tercera limitada, omnisciente)
   - Distancia narrativa (íntima vs distante)
   - Tono emocional dominante
   - Uso de ironía, humor, sarcasmo
   - Registro lingüístico (formal, coloquial, lírico, telegráfico)

2. **PROSA Y RITMO**
   - Longitud media de oraciones (cortas/largas/variadas)
   - Estructura de párrafos
   - Uso de fragmentos y elipsis
   - Ritmo narrativo (pausado, acelerado, alternante)
   - Musicalidad y cadencia
   - Uso de repetición como recurso estilístico

3. **DIÁLOGOS**
   - Estilo de diálogo (naturalista, estilizado, minimalista)
   - Uso de acotaciones y verbos de habla
   - Dialecto, jerga, registros de personajes
   - Subtexto en conversaciones
   - Proporción diálogo vs narración

4. **DESCRIPCIONES Y AMBIENTACIÓN**
   - Estilo descriptivo (minimalista, exuberante, sensorial)
   - Uso de los cinco sentidos
   - Integración de escenario en la acción
   - Metáforas y símiles recurrentes
   - Tratamiento del tiempo y el espacio

5. **CONSTRUCCIÓN DE PERSONAJES**
   - Método de caracterización (acción, diálogo, pensamiento, descripción)
   - Profundidad psicológica
   - Arcos de transformación
   - Relaciones y dinámicas interpersonales
   - Monólogo interior y flujo de conciencia

6. **ESTRUCTURA NARRATIVA**
   - Patrones de estructura (lineal, fragmentada, circular)
   - Manejo de la tensión y el suspense
   - Uso de cliffhangers y giros
   - Técnicas de apertura y cierre de capítulos
   - Manejo del ritmo (escenas lentas vs rápidas)

7. **TEMAS Y OBSESIONES**
   - Temas recurrentes del autor
   - Símbolos y motivos
   - Subtexto y capas de significado
   - Posición moral/filosófica

8. **LÉXICO Y RECURSOS LINGÜÍSTICOS**
   - Vocabulario característico
   - Palabras y expresiones favoritas
   - Neologismos o usos creativos del lenguaje
   - Figuras retóricas preferidas
   - Nivel de complejidad léxica

9. **REGLAS DE ORO** (10-15 mandamientos estilísticos concretos)
   - Reglas específicas que un ghostwriter debe seguir para emular este estilo
   - Lo que NUNCA haría este autor
   - Lo que SIEMPRE hace este autor

10. **EJEMPLO DE PROSA MODELO**
    - Un párrafo original (no copiado) que ejemplifique el estilo descrito
    - Anotaciones sobre por qué ese párrafo captura la esencia del estilo

${langInstructions}
Escribe de forma detallada y práctica. Esta guía será usada por un sistema de IA para generar novelas en este estilo.`;

    case "idea_writing":
      return `${baseRole}

Tu tarea es crear una GUÍA DE ESCRITURA DETALLADA para desarrollar la siguiente idea narrativa:
"${params.idea}"
${params.genre ? `Género: ${params.genre}` : ''}
${params.tone ? `Tono deseado: ${params.tone}` : ''}

La guía debe cubrir TODOS estos apartados:

1. **ANÁLISIS DE LA PREMISA**
   - Potencial narrativo de la idea
   - Conflicto central identificado
   - Preguntas dramáticas clave
   - Público objetivo

2. **VOZ Y TONO RECOMENDADOS**
   - Tipo de narrador ideal para esta historia
   - Tono emocional que mejor sirve a la premisa
   - Registro lingüístico apropiado
   - Nivel de intimidad narrativa

3. **ESTRUCTURA SUGERIDA**
   - Modelo estructural recomendado (tres actos, viaje del héroe, estructura en W, etc.)
   - Ritmo de revelaciones y giros
   - Puntos de inflexión clave
   - Proporciones de acción, reflexión y diálogo

4. **AMBIENTACIÓN Y WORLDBUILDING**
   - Elementos del mundo que requieren desarrollo
   - Reglas del universo narrativo
   - Atmósfera y ambientes clave
   - Detalles sensoriales a potenciar

5. **SISTEMA DE PERSONAJES**
   - Arquetipos recomendados
   - Dinámicas de relación sugeridas
   - Arcos de transformación potenciales
   - Función de cada personaje en la trama

6. **TÉCNICAS NARRATIVAS ESPECÍFICAS**
   - Recursos estilísticos recomendados para este género/tono
   - Manejo del tiempo (flashbacks, prolepsis, tiempo real)
   - Uso de tensión y suspense
   - Gestión del ritmo por capítulos

7. **TRAMPAS A EVITAR**
   - Clichés específicos del género
   - Errores comunes con esta premisa
   - Soluciones fáciles que empobrecerían la historia
   - Incoherencias potenciales

8. **LÉXICO Y ESTILO RECOMENDADO**
   - Campo semántico apropiado
   - Nivel de vocabulario
   - Figuras retóricas que encajan con el tono
   - Longitud de oraciones y párrafos recomendada

9. **REGLAS DE ESCRITURA** (10-15 mandamientos específicos)
   - Directrices concretas para el ghostwriter
   - Qué hacer y qué NO hacer

10. **EJEMPLO DE ESCENA MODELO**
    - Una escena breve original que ejemplifique el tono y estilo ideales
    - Anotaciones sobre las técnicas empleadas

${langInstructions}
Sé específico y práctico. Esta guía será usada por un sistema de IA para generar una novela.`;

    case "pseudonym_style":
      return `${baseRole}

Tu tarea es crear una GUÍA DE ESTILO PROFESIONAL para el pseudónimo literario "${params.pseudonymName}".

Información del pseudónimo:
${params.pseudonymBio ? `- Biografía: ${params.pseudonymBio}` : ''}
${params.pseudonymGenre ? `- Género principal: ${params.pseudonymGenre}` : ''}
${params.pseudonymTone ? `- Tono narrativo: ${params.pseudonymTone}` : ''}
${params.existingStyleGuides?.length ? `\nGuías de estilo existentes del pseudónimo:\n${params.existingStyleGuides.join('\n---\n')}` : ''}

Crea una guía de estilo COMPLETA y COHERENTE que defina la identidad literaria de este pseudónimo. La guía debe:

1. **IDENTIDAD LITERARIA**
   - Voz autorial única y reconocible
   - Filosofía narrativa del pseudónimo
   - Marca personal en la escritura
   - Elementos que lo distinguen de otros autores

2. **VOZ Y REGISTRO**
   - Tipo de narrador preferido
   - Tono emocional distintivo
   - Registro lingüístico (formal, coloquial, técnico, poético)
   - Personalidad que transmite la prosa

3. **PROSA CARACTERÍSTICA**
   - Estructura de oraciones predilecta
   - Ritmo y cadencia narrativa
   - Uso de párrafos (cortos, largos, variados)
   - Recursos estilísticos favoritos
   - Manejo de transiciones

4. **DIÁLOGOS**
   - Estilo de diálogo del pseudónimo
   - Tratamiento de las acotaciones
   - Voces diferenciadas de personajes
   - Subtexto y silencios

5. **DESCRIPCIONES**
   - Estilo descriptivo (sensorial, minimalista, barroco)
   - Sentidos predominantes
   - Integración de ambientación en la acción
   - Metáforas y comparaciones típicas

6. **TEMAS Y PREOCUPACIONES**
   - Temas recurrentes en la obra del pseudónimo
   - Motivos y símbolos frecuentes
   - Posición moral/filosófica
   - Mensajes que subyacen

7. **LÉXICO AUTORIZADO Y PROHIBIDO**
   - Vocabulario preferido
   - Palabras y expresiones características
   - Muletillas de IA a evitar (sin embargo, no obstante, a pesar de, etc.)
   - Palabras prohibidas por sonar artificiales

8. **REGLAS DE ORO DEL PSEUDÓNIMO** (15-20 mandamientos)
   - Directrices inquebrantables de estilo
   - Lo que este autor SIEMPRE hace
   - Lo que este autor NUNCA hace
   - Criterios de calidad mínima

9. **EJEMPLO DE PROSA MODELO**
    - Un fragmento original que defina la voz del pseudónimo
    - Análisis de las técnicas empleadas

${langInstructions}
Esta guía será usada como directriz principal para todos los proyectos de este pseudónimo.`;

    case "series_writing":
      return `${baseRole}

Tu tarea es crear una GUÍA DE ESCRITURA PARA SERIE literaria.

Información de la serie:
- Título: ${params.seriesTitle}
${params.seriesDescription ? `- Descripción: ${params.seriesDescription}` : ''}
${params.seriesTotalBooks ? `- Libros planificados: ${params.seriesTotalBooks}` : ''}
${params.seriesWorkType ? `- Tipo: ${params.seriesWorkType}` : ''}
${params.genre ? `- Género: ${params.genre}` : ''}
${params.pseudonymName ? `- Autor/Pseudónimo: ${params.pseudonymName}` : ''}

Crea una guía EXHAUSTIVA para mantener la coherencia y calidad a lo largo de toda la serie:

1. **VISIÓN GLOBAL DE LA SERIE**
   - Arco narrativo principal (inicio a fin)
   - Tema central que une todos los volúmenes
   - Evolución tonal a lo largo de la serie
   - Promesa al lector y cómo cumplirla

2. **ESTRUCTURA POR VOLÚMENES**
   - Función narrativa de cada libro en el arco global
   - Balance de tramas autoconclusivas vs continuadas
   - Escalada de tensión/complejidad entre volúmenes
   - Cliffhangers y ganchos inter-libro

3. **GESTIÓN DE PERSONAJES**
   - Arcos de personaje que abarcan múltiples libros
   - Introducción escalonada de personajes
   - Evolución y transformaciones a largo plazo
   - Gestión de elenco creciente
   - Muertes y salidas significativas

4. **CONTINUIDAD Y WORLDBUILDING**
   - Elementos del mundo que se revelan progresivamente
   - Reglas del universo que deben mantenerse
   - Sistema de magia/tecnología/poder (si aplica)
   - Geografía, política, historia del mundo
   - Evolución del mundo a lo largo de la serie

5. **HILOS ARGUMENTALES**
   - Gestión de tramas principales vs subtramas
   - Tramas que se plantan en un libro y florecen en otro
   - Pistas y foreshadowing inter-libro
   - Resolución satisfactoria de todos los hilos

6. **COHERENCIA ESTILÍSTICA**
   - Voz narrativa consistente entre volúmenes
   - Evolución permisible del estilo
   - Tono por volumen (si varía)
   - Vocabulario y registro constante

7. **GESTIÓN DEL CONOCIMIENTO DEL LECTOR**
   - Recordatorios elegantes (no infodumps)
   - Cómo manejar lectores que empiezan por cualquier libro
   - Revelaciones que cambian la percepción de eventos anteriores
   - Misterios a largo plazo

8. **TRAMPAS ESPECÍFICAS DE SERIES**
   - Síndrome del segundo libro
   - Inflación de poder/escala
   - Personajes que pierden coherencia
   - Tramas abandonadas
   - Final insatisfactorio

9. **CHECKLIST POR VOLUMEN**
   - Elementos que cada libro DEBE incluir
   - Conexiones obligatorias con el arco general
   - Punto de entrada y salida del volumen
   - Balance entre nuevo contenido y continuidad

10. **PLANIFICACIÓN DE HILOS** (tabla estructurada)
    - Lista de hilos argumentales principales
    - En qué volumen se introduce cada uno
    - En qué volumen se resuelve
    - Estado intermedio en cada libro

${langInstructions}
Sé exhaustivo y práctico. Esta guía será usada para mantener la coherencia de una serie literaria completa generada por IA.`;

    default:
      return baseRole;
  }
}

export async function generateStyleGuide(params: GenerateGuideParams): Promise<GenerateGuideResult> {
  const systemPrompt = buildSystemPrompt(params);

  let userMessage = "";
  switch (params.guideType) {
    case "author_style":
      userMessage = `Genera una guía de estilo detallada basada en el estilo literario de ${params.authorName}.${params.genre ? ` Enfócate especialmente en su trabajo dentro del género ${params.genre}.` : ''} La guía debe ser lo suficientemente detallada para que un sistema de IA pueda emular fielmente su estilo de escritura.`;
      break;
    case "idea_writing":
      userMessage = `Genera una guía de escritura completa para desarrollar esta idea: "${params.idea}".${params.genre ? ` Género: ${params.genre}.` : ''}${params.tone ? ` Tono deseado: ${params.tone}.` : ''} La guía debe proporcionar directrices concretas y prácticas para la generación de una novela.`;
      break;
    case "pseudonym_style":
      userMessage = `Genera una guía de estilo profesional completa para el pseudónimo "${params.pseudonymName}". Define su identidad literaria, voz, y reglas de escritura de forma que cualquier texto generado bajo este pseudónimo sea coherente y reconocible.`;
      break;
    case "series_writing":
      userMessage = `Genera una guía de escritura exhaustiva para la serie "${params.seriesTitle}"${params.seriesTotalBooks ? ` (${params.seriesTotalBooks} volúmenes planificados)` : ''}. La guía debe asegurar coherencia narrativa, estilística y argumental a lo largo de toda la serie.`;
      break;
  }

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: userMessage }] }],
    config: {
      systemInstruction: systemPrompt,
      temperature: 1.0,
      topP: 0.95,
      maxOutputTokens: 32768,
      thinkingConfig: { thinkingBudget: 1024 },
    },
  });

  const text = response.text || "";
  const inputTokens = (response as any).usageMetadata?.promptTokenCount || 0;
  const outputTokens = (response as any).usageMetadata?.candidatesTokenCount || 0;

  let title = "";
  switch (params.guideType) {
    case "author_style":
      title = `Estilo de ${params.authorName}${params.genre ? ` (${params.genre})` : ''}`;
      break;
    case "idea_writing":
      title = `Guía: ${(params.idea || "").substring(0, 80)}${(params.idea || "").length > 80 ? '...' : ''}`;
      break;
    case "pseudonym_style":
      title = `Estilo de ${params.pseudonymName}`;
      break;
    case "series_writing":
      title = `Guía de Serie: ${params.seriesTitle}`;
      break;
  }

  return { title, content: text, inputTokens, outputTokens };
}
