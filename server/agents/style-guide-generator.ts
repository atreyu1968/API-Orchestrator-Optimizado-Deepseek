import OpenAI from "openai";

const ai = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY!, baseURL: "https://api.deepseek.com" });

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
  // Parámetros para la guía de novela basada en seudónimo (case "pseudonym_style"):
  // condicionan cuántos capítulos planificar y si incluir prólogo/epílogo/nota.
  chapterCountHint?: number;
  hasPrologue?: boolean;
  hasEpilogue?: boolean;
  hasAuthorNote?: boolean;
  seriesTitle?: string;
  seriesDescription?: string;
  seriesTotalBooks?: number;
  seriesWorkType?: string;
  seriesIdea?: string;
  language?: string;
  forbiddenNames?: string[];
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

9. **ÉPOCA(S) HISTÓRICA(S) DE LA NARRACIÓN** ⚠️ OBLIGATORIO
   Esta sección es CRÍTICA: el arquitecto la usará para fijar el "lexico_historico" del World Bible y prevenir anacronismos. Debe quedar inequívoca.

   9.1 **Época principal de la novela** (OBLIGATORIO):
       - Formato exacto: "Año(s) + Lugar geográfico". Ejemplos válidos:
         · "1888, Londres victoriano"
         · "Verano de 79 d.C., Pompeya"
         · "1936-1939, España (Guerra Civil)"
         · "Contemporánea, Madrid (2024)"
         · "Futuro cercano (~2070), Tokio"
         · "Mundo secundario, equivalente cultural a Europa del s. XV"
       - Si la idea sugiere ambigüedad temporal, ELIGE UNA ÉPOCA Y JUSTÍFICALA brevemente.

   9.2 **¿Tiene líneas temporales paralelas?** (OBLIGATORIO responder Sí/No):
       - Si NO: deja claro que toda la novela transcurre en la época principal.
       - Si SÍ: declara cada época paralela con un identificador único y la siguiente ficha por cada una:
         · id: slug corto y único (ej. "presente_2024", "pasado_1888", "linea_a")
         · epoca: "Año(s) + Lugar"
         · registro_linguistico: 1-2 frases sobre tono/registro propios de esa época
         · vocabulario_epoca_autorizado: 8-15 términos representativos de esa época que el ghostwriter PUEDE usar
         · terminos_anacronicos_prohibidos: 8-15 términos modernos prohibidos en esa época (omitir si la época ES la actual)
         · notas_voz_historica: 2-4 frases con el matiz histórico/cultural a mantener
       - Indica también qué capítulos (rangos o lista) corresponden a cada época, para que el arquitecto asigne "epoca_id" a cada capítulo.

   9.3 **Vocabulario y registro de la época principal** (OBLIGATORIO):
       - registro_linguistico: descripción concisa
       - vocabulario_epoca_autorizado: 10-20 términos
       - terminos_anacronicos_prohibidos: 10-20 términos modernos prohibidos (omitir sólo si la novela es estrictamente contemporánea)
       - notas_voz_historica: 2-4 frases

10. **REGLAS DE ESCRITURA** (10-15 mandamientos específicos)
    - Directrices concretas para el ghostwriter
    - Qué hacer y qué NO hacer

11. **EJEMPLO DE ESCENA MODELO**
    - Una escena breve original que ejemplifique el tono y estilo ideales
    - Anotaciones sobre las técnicas empleadas

${langInstructions}
Sé específico y práctico. Esta guía será usada por un sistema de IA para generar una novela.`;

    case "pseudonym_style": {
      // NUEVO PROPÓSITO (mayo 2026): este case ya NO genera una guía de estilo
      // del pseudónimo; ahora INVENTA una novela original COMPLETA y produce su
      // guía de escritura, garantizando que la idea, género, tono y tratamiento
      // encajen con el estilo ya establecido del seudónimo (su(s) guía(s) de
      // estilo activa(s) + bio + género/tono por defecto).
      const chapters = params.chapterCountHint && params.chapterCountHint > 0 ? params.chapterCountHint : 20;
      const extras: string[] = [];
      if (params.hasPrologue) extras.push("prólogo");
      if (params.hasEpilogue) extras.push("epílogo");
      if (params.hasAuthorNote) extras.push("nota del autor");
      const extrasLine = extras.length > 0
        ? `Además del cuerpo principal, la novela incluirá: ${extras.join(", ")}.`
        : "La novela NO incluirá prólogo, epílogo ni nota del autor; planifica solo capítulos numerados.";

      return `${baseRole}

Tu tarea es INVENTAR una novela original COMPLETA y producir su GUÍA DE ESCRITURA detallada, garantizando que el resultado sea apropiado para el pseudónimo literario "${params.pseudonymName}" — es decir, que case con su voz, géneros típicos, tono y reglas de estilo ya establecidos.

NO te dan una idea ni una premisa: la inventas tú leyendo cuidadosamente el material del pseudónimo que aparece más abajo. La novela que propongas debe ser plausible dentro de lo que este autor publicaría: misma sensibilidad temática, mismo registro, mismas obsesiones narrativas.

Información del pseudónimo:
${params.pseudonymBio ? `- Biografía: ${params.pseudonymBio}` : '- (Sin biografía registrada)'}
${params.pseudonymGenre ? `- Género principal habitual: ${params.pseudonymGenre}` : ''}
${params.pseudonymTone ? `- Tono narrativo habitual: ${params.pseudonymTone}` : ''}

${params.existingStyleGuides?.length
  ? `GUÍA(S) DE ESTILO ACTIVA(S) DEL PSEUDÓNIMO (lectura OBLIGATORIA — la novela debe ajustarse a estas reglas):\n\n${params.existingStyleGuides.join('\n\n---\n\n')}`
  : '⚠️ ATENCIÓN: este pseudónimo no tiene aún guía de estilo activa. Deduce su voz a partir de la biografía, el género y el tono indicados, y sé conservador.'}

Parámetros del proyecto a planificar:
- Número de capítulos: ${chapters}
- ${extrasLine}

REQUISITOS DE LA RESPUESTA:

La PRIMERA línea de tu respuesta DEBE ser exactamente:
TÍTULO DE LA NOVELA: <título inventado>

Una línea en blanco después, y a continuación la guía completa con TODOS estos apartados:

1. **PREMISA ORIGINAL DE LA NOVELA**
   - Sinopsis de 2-3 párrafos (la idea inventada)
   - Conflicto central
   - Pregunta dramática principal
   - Por qué esta historia encaja con el pseudónimo (justifica explícitamente)

2. **GÉNERO Y SUBGÉNERO**
   - Género principal coherente con el pseudónimo
   - Subgénero específico
   - Tono emocional dominante

3. **VOZ Y NARRADOR**
   - Tipo de narrador (debe ser el habitual del pseudónimo)
   - Distancia narrativa
   - Registro lingüístico
   - Cómo aplicar las reglas de estilo del pseudónimo a este libro concreto

4. **ESTRUCTURA**
   - Modelo estructural recomendado (tres actos, viaje del héroe, etc.)
   - Distribución aproximada de capítulos por acto
   - Puntos de inflexión clave (capítulo aproximado de cada uno)
   - Ritmo de revelaciones

5. **AMBIENTACIÓN Y WORLDBUILDING**
   - Lugar(es) y atmósfera
   - Reglas del mundo (si aplica)
   - Detalles sensoriales prioritarios
   - Coherencia con ambientaciones típicas del pseudónimo

6. **SISTEMA DE PERSONAJES**
   - Protagonista: nombre, edad, función, arco
   - Secundarios principales (3-5): nombre, función, arco breve
   - Antagonista o fuerza de oposición
   - Dinámicas relacionales clave
   ⚠️ Nombres COMPLETAMENTE NUEVOS, nunca reutilizar los de la lista de prohibidos si la hay.

7. **TEMAS Y MOTIVOS**
   - Temas centrales (deben resonar con las preocupaciones habituales del pseudónimo)
   - Motivos visuales/simbólicos recurrentes
   - Mensaje subyacente

8. **PLAN DE CAPÍTULOS** (OBLIGATORIO — uno por uno, los ${chapters})
   - Por cada capítulo: número, título sugerido (1 línea) y sinopsis breve (2-4 líneas) con qué pasa, dónde estamos en el arco, y qué punto de inflexión cubre si toca.
   ${extras.length > 0 ? `- Si incluyes prólogo/epílogo/nota del autor, descríbelos también con la misma estructura.` : ''}

9. **ÉPOCA HISTÓRICA DE LA NARRACIÓN** ⚠️ OBLIGATORIO
   - Formato exacto: "Año(s) + Lugar geográfico" (ej. "1888, Londres victoriano"; "Contemporánea, Madrid (2024)").
   - registro_linguistico: 1-2 frases.
   - vocabulario_epoca_autorizado: 10-20 términos.
   - terminos_anacronicos_prohibidos: 10-20 términos modernos prohibidos en esa época (omitir solo si la novela es estrictamente contemporánea).
   - notas_voz_historica: 2-4 frases con el matiz histórico/cultural a mantener.
   - Si hay líneas temporales paralelas, declara cada época con su ficha (id, época, registro, vocabulario, anacronismos, notas).

10. **REGLAS DE ESCRITURA PARA ESTA NOVELA** (10-15 mandamientos)
    - Reglas concretas para el ghostwriter, derivadas de las guías de estilo del pseudónimo aplicadas a esta historia concreta.
    - Qué hacer y qué NO hacer.

11. **TRAMPAS A EVITAR**
    - Clichés del género
    - Errores comunes con esta premisa
    - Soluciones fáciles que empobrecerían la historia

12. **EJEMPLO DE ESCENA MODELO**
    - Una escena breve original (200-400 palabras) que ejemplifique cómo aplicar las reglas del pseudónimo a esta historia concreta.

${langInstructions}
Sé específico y práctico. Esta guía será usada por el sistema para generar la novela completa, capítulo a capítulo.`;
    }

    case "series_writing":
      return `${baseRole}

Tu tarea es crear una GUÍA DE ESCRITURA PARA SERIE literaria.

Información de la serie:
- Título: ${params.seriesTitle}
${params.seriesIdea ? `- Idea/Concepto: ${params.seriesIdea}` : ''}
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

11. **ÉPOCA(S) HISTÓRICA(S) DE LA SERIE** ⚠️ OBLIGATORIO
    Esta sección es CRÍTICA: el arquitecto la usará para fijar el "lexico_historico" del World Bible de cada volumen y prevenir anacronismos. Debe quedar inequívoca.

    11.1 **Época principal de la serie** (OBLIGATORIO):
         - Formato exacto: "Año(s) + Lugar geográfico". Ejemplos:
           · "1888-1895, Londres victoriano"
           · "Siglo XXI, Madrid contemporáneo"
           · "Mundo secundario, equivalente cultural a Europa del s. XV"
         - Si la serie cubre un periodo largo, indica el rango global y luego cómo evoluciona.

    11.2 **Evolución temporal entre volúmenes** (OBLIGATORIO):
         - Para cada volumen planificado, indica la época concreta en que transcurre.
         - Si la serie avanza en el tiempo (ej. cada libro = una década), descríbelo explícitamente.
         - Si todos los volúmenes están en la misma época, indícalo.

    11.3 **¿Tienen los volúmenes líneas temporales paralelas?** (OBLIGATORIO Sí/No):
         - Si NO: deja claro que cada volumen tiene una sola época.
         - Si SÍ (ej. dual-timeline pasado/presente): declara cada época paralela con:
           · id: slug corto y único (ej. "presente_2024", "pasado_1888")
           · epoca: "Año(s) + Lugar"
           · registro_linguistico: 1-2 frases
           · vocabulario_epoca_autorizado: 8-15 términos representativos
           · terminos_anacronicos_prohibidos: 8-15 términos prohibidos en esa época
           · notas_voz_historica: 2-4 frases
         - Indica para cada volumen qué capítulos pertenecen a cada época, para que el arquitecto asigne "epoca_id" a cada capítulo.

    11.4 **Vocabulario y registro de la época principal** (OBLIGATORIO):
         - registro_linguistico: descripción concisa
         - vocabulario_epoca_autorizado: 10-20 términos
         - terminos_anacronicos_prohibidos: 10-20 términos modernos prohibidos (omitir sólo si la serie es estrictamente contemporánea)
         - notas_voz_historica: 2-4 frases

${langInstructions}
Sé exhaustivo y práctico. Esta guía será usada para mantener la coherencia de una serie literaria completa generada por IA.`;

    default:
      return baseRole;
  }
}

export async function generateStyleGuide(params: GenerateGuideParams): Promise<GenerateGuideResult> {
  let systemPrompt = buildSystemPrompt(params);

  if (params.forbiddenNames && params.forbiddenNames.length > 0) {
    systemPrompt += `\n\n⛔ NOMBRES YA USADOS EN OTRAS OBRAS (PROHIBIDO REUTILIZAR) ⛔
Los siguientes nombres y apellidos ya fueron usados en otras novelas del mismo autor. ESTÁ TERMINANTEMENTE PROHIBIDO reutilizar cualquiera de ellos en esta guía, ni como sugerencia de personaje, ni como ejemplo, ni como nombre ni como apellido:
${params.forbiddenNames.join(", ")}

Si necesitas sugerir nombres de personajes, inventa nombres COMPLETAMENTE NUEVOS y originales que NO aparezcan en esta lista.`;
  }

  let userMessage = "";
  switch (params.guideType) {
    case "author_style":
      userMessage = `Genera una guía de estilo detallada basada en el estilo literario de ${params.authorName}.${params.genre ? ` Enfócate especialmente en su trabajo dentro del género ${params.genre}.` : ''} La guía debe ser lo suficientemente detallada para que un sistema de IA pueda emular fielmente su estilo de escritura.`;
      break;
    case "idea_writing":
      userMessage = `Genera una guía de escritura completa para desarrollar esta idea: "${params.idea}".${params.genre ? ` Género: ${params.genre}.` : ''}${params.tone ? ` Tono deseado: ${params.tone}.` : ''} La guía debe proporcionar directrices concretas y prácticas para la generación de una novela.`;
      break;
    case "pseudonym_style":
      userMessage = `Inventa una novela original apropiada para el pseudónimo "${params.pseudonymName}" basándote en su(s) guía(s) de estilo, biografía, género y tono indicados en el system prompt. Genera la guía de escritura completa de esa novela inventada (premisa, estructura, personajes, plan capítulo a capítulo, época, reglas de escritura, escena modelo). Recuerda comenzar con la línea "TÍTULO DE LA NOVELA: ..." obligatoriamente.`;
      break;
    case "series_writing":
      userMessage = `Genera una guía de escritura exhaustiva para la serie "${params.seriesTitle}"${params.seriesTotalBooks ? ` (${params.seriesTotalBooks} volúmenes planificados)` : ''}.${params.seriesIdea ? ` Concepto de la serie: ${params.seriesIdea}` : ''} La guía debe asegurar coherencia narrativa, estilística y argumental a lo largo de toda la serie.${params.seriesTotalBooks && params.seriesTotalBooks > 1 ? ` Incluye al final una sección "PLANIFICACIÓN DE VOLÚMENES" con título sugerido y sinopsis breve para cada uno de los ${params.seriesTotalBooks} libros planificados.` : ''}`;
      break;
  }

  const response = await ai.chat.completions.create({
    model: "deepseek-v4-flash",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: 1.0,
    top_p: 0.95,
    max_tokens: 32768,
    ...({ thinking: { type: "disabled" } } as any),
  });

  const text = response.choices?.[0]?.message?.content || "";
  const inputTokens = response.usage?.prompt_tokens || 0;
  const outputTokens = response.usage?.completion_tokens || 0;

  let title = "";
  switch (params.guideType) {
    case "author_style":
      title = `Estilo de ${params.authorName}${params.genre ? ` (${params.genre})` : ''}`;
      break;
    case "idea_writing":
      title = `Guía: ${(params.idea || "").substring(0, 80)}${(params.idea || "").length > 80 ? '...' : ''}`;
      break;
    case "pseudonym_style": {
      // Extrae el título inventado de la primera línea ("TÍTULO DE LA NOVELA: ...").
      // Robusto frente a variantes razonables del modelo:
      //   "TÍTULO DE LA NOVELA: Foo"
      //   "**TÍTULO DE LA NOVELA: Foo**"
      //   "**TÍTULO DE LA NOVELA:** Foo"
      //   "# TÍTULO: Foo"
      //   "- TÍTULO: Foo"
      // Solo mira la PRIMERA línea no vacía (no usa el flag `m` por una razón:
      // si el modelo se salta el formato en la primera línea no debe colarse
      // un "Título: " posterior dentro de la guía como título del proyecto).
      const firstNonEmpty = text.split(/\r?\n/).map(l => l.trim()).find(l => l.length > 0) || "";
      const cleanedFirst = firstNonEmpty
        .replace(/^[#>\-*•·\s]+/, "")  // prefijos markdown (encabezados, listas)
        .replace(/\*+/g, "")            // marcas de negrita/cursiva
        .trim();
      const firstLineMatch = cleanedFirst.match(/^T[ÍI]TULO(?:\s+DE\s+LA\s+NOVELA)?\s*:\s*(.+)$/i);
      const inventedTitle = firstLineMatch
        ? firstLineMatch[1].trim().replace(/^[«"'`]+|[»"'`]+$/g, "")
        : "";
      title = inventedTitle.length > 0
        ? inventedTitle.substring(0, 120)
        : `Novela original para ${params.pseudonymName}`;
      break;
    }
    case "series_writing":
      title = `Guía de Serie: ${params.seriesTitle}`;
      break;
  }

  return { title, content: text, inputTokens, outputTokens };
}
