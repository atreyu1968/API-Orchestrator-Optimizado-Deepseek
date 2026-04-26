# LitAgents v6.7 — Sistema de Orquestacion de Agentes Literarios IA

Sistema autonomo de orquestacion de agentes de IA para la escritura, edicion, traduccion y produccion de novelas completas usando **DeepSeek V4** como unico backend de IA.

**PWA instalable** — se puede instalar en escritorio y movil directamente desde el navegador.

## Novedades v6.7 — Migracion a DeepSeek V4

- **Backend de IA migrado a DeepSeek V4-Flash**: Todos los agentes literarios (Arquitecto, Ghostwriter, Editor, Corrector, Revisor Final, Centinela, Auditores, Re-editores, Adaptadores, Generador de Guias, Generador de Metadatos KDP, etc.) ahora usan DeepSeek V4-Flash via API compatible con OpenAI.
- **Reduccion de costos ~5x**: De $0.30/$2.50 por millon (Gemini 2.5 Flash) a $0.14/$0.28 por millon (DeepSeek V4-Flash). El thinking ya no se factura aparte.
- **Eliminacion total de Gemini**: Se removio toda la integracion con Google Gemini y la seccion de generacion de portadas IA. La unica API requerida es `DEEPSEEK_API_KEY`.
- **Pricing y badges actualizados**: Dashboard y pagina de costos muestran los nuevos precios y badges de DeepSeek.
- **Cost tracking unificado**: Todos los eventos de uso de IA (`ai_usage_events`) usan el calculador centralizado de costos con la tabla de precios de DeepSeek como unica fuente de verdad.

## Novedades v6.6 — Notas Editoriales en Dos Pasos

- **Soporte multi-capitulo en notas editoriales**: El parser detecta correcciones que afectan a varios capitulos (arcos) y reparte la instruccion entre todos ellos, inyectando el rol especifico de cada capitulo y los roles "hermanos" en el plan quirurgico.
- **Previsualizacion antes de aplicar**: Nuevo flujo en dos pasos. Primero se analizan las notas y se muestran las instrucciones extraidas (con badges de arco y plan distributivo); el usuario marca/desmarca con checkboxes y solo despues lanza la reescritura con la seleccion final.
- **Carga de notas desde archivo**: Acepta `.txt` y `.md` directamente en el textarea de notas editoriales.
- **Snapshot pre-edicion + diff visual**: Antes de reescribir un capitulo se guarda su contenido anterior (`preEditContent`/`preEditAt`). Cada capitulo modificado muestra un boton "Ver cambios" con un dialogo de diff palabra a palabra (rojo tachado = eliminado, verde = anadido).
- **Revision Final automatica post-editorial**: Al terminar de aplicar las notas, se relanza el Revisor Final para recalcular la puntuacion global y mostrar la mejora/regresion antes-despues con flecha indicadora.
- **Cancelacion entre capitulos**: Boton de cancelar registra un AbortController y se verifica entre capitulos y antes de la revision final, permitiendo detener procesos largos sin dejar el proyecto en estado inconsistente.

## Caracteristicas Principales

- **Generador de Novelas**: Pipeline completo con 13+ agentes especializados para escribir novelas de principio a fin
- **Re-editor de Manuscritos (LitEditors)**: Importa y edita profesionalmente manuscritos externos en multiples idiomas con 12 agentes especializados
- **Adaptacion Literaria Profesional (LitTranslators)**: Sistema de adaptacion literaria (no traduccion literal) con resultado listo para publicacion
- **Taller de Guias**: Generacion de guias de estilo, escritura por idea, identidad de pseudonimo y guias extendidas de serie con creacion automatica de proyecto
- **World Bible Progresiva**: Base de datos de consistencia que se enriquece automaticamente capitulo a capitulo
- **Notas del Autor**: Instrucciones personalizadas para que los agentes eviten errores conocidos
- **Zero Continuity Errors**: Validacion inmediata post-escritura, deteccion de personajes muertos, filtraciones de conocimiento y drift de apariencia
- **Anti-Repeticion entre Capitulos**: Ventana deslizante con texto real de capitulos anteriores y deteccion de patrones narrativos repetidos
- **Seguimiento de Costos**: Tracking granular de uso de tokens por proyecto, agente y modelo con precios actualizados
- **Gestion de Series**: Continuidad inter-libros con snapshots automaticos y verificacion de arcos narrativos
- **Spin-offs**: Creacion de series derivadas con protagonista de la serie original y guia auto-generada
- **Critica Editorial**: Inyeccion de feedback externo (editores, beta-readers) como guia prioritaria en re-ediciones
- **Autenticacion**: Proteccion con contrasena para instalaciones en servidor propio
- **Audiolibros**: Conversion de novelas a audiolibro con voces TTS de Fish Audio (modelo speech-1.6), portadas personalizadas (subida manual) y descarga en ZIP
- **Metadatos KDP**: Generacion automatica de metadata para Amazon KDP (descripcion HTML, keywords, categorias BISAC)
- **Catalogo de Libros y Back Matter**: Gestion centralizada de obras publicadas con generacion automatica de paginas finales
- **Originalidad de Nombres**: Sistema dinamico que prohibe al Arquitecto reutilizar nombres de personajes entre novelas diferentes (permitidos dentro de la misma serie)
- **Corrector Ortotipografico**: Agente de correccion post-produccion que adapta al genero y estilo del autor, detecta glitches de IA y aplica correcciones directamente al manuscrito original
- **Thinking Mejorado**: Presupuestos de pensamiento (thinking budget) optimizados por agente — el Ghostwriter planifica con 10K tokens de razonamiento antes de escribir
- **PWA**: Aplicacion web progresiva instalable con soporte offline

## Agentes del Sistema

### Generador de Novelas
| Agente | Modelo | Tokens Max | Funcion |
|--------|--------|------------|---------|
| Arquitecto Global | DeepSeek V4-Flash | 65536 | Planificacion de estructura narrativa y World Bible (thinking: 8K) |
| Ghostwriter | DeepSeek V4-Flash | 65536 | Escritura creativa de capitulos completos (thinking: 16K) |
| Editor | DeepSeek V4-Flash | 8192 | Evaluacion de calidad y plan quirurgico de correcciones (thinking: 4K) |
| Corrector (Copyeditor) | DeepSeek V4-Flash | 65536 | Reescritura y correccion de capitulos rechazados (thinking: 8K) |
| Revisor Final | DeepSeek V4-Flash | 16384 | Evaluacion completa del manuscrito con auditoria forense (thinking: 4K) |
| Centinela de Continuidad | DeepSeek V4-Flash | 4096 | Validacion de consistencia post-escritura |
| Auditor de Voz y Ritmo | DeepSeek V4-Flash | 4096 | Deteccion de problemas de ritmo narrativo |
| Detector de Repeticiones | DeepSeek V4-Flash | 4096 | Deteccion de repeticiones semanticas y lexicas |
| Validador de Arcos | DeepSeek V4-Flash | 4096 | Verificacion de arcos narrativos de personajes |

### Expansion y Reestructuracion
| Agente | Modelo | Tokens Max | Funcion |
|--------|--------|------------|---------|
| Analizador de Expansion | DeepSeek V4-Flash | 8192 | Identifica capitulos cortos y gaps narrativos |
| Expansor de Capitulos | DeepSeek V4-Flash | 65536 | Expande capitulos cortos manteniendo coherencia |
| Generador de Capitulos Nuevos | DeepSeek V4-Flash | 65536 | Inserta capitulos nuevos para llenar gaps |
| Reestructurador | DeepSeek V4-Flash | 8192 | Reordena capitulos para mejor pacing |

### Re-editor (LitEditors)
| Agente | Modelo | Tokens Max | Funcion |
|--------|--------|------------|---------|
| Analizador de Manuscritos | DeepSeek V4-Flash | — | Extraccion y analisis de manuscritos importados |
| Editor de Re-edicion | DeepSeek V4-Flash | 8192 | Revision profunda con analisis de 7 categorias |
| Corrector de Re-edicion | DeepSeek V4-Flash | 65536 | Correccion con World Bible y contexto adyacente |
| Centinela de Continuidad | DeepSeek V4-Flash | 4096 | Auditoria de continuidad multi-capitulo |
| Auditor de Voz y Ritmo | DeepSeek V4-Flash | 4096 | Analisis de ritmo y pacing |
| Detector de Repeticiones | DeepSeek V4-Flash | 4096 | Deteccion de repeticiones semanticas |
| Detector de Anacronismos | DeepSeek V4-Flash | 4096 | Verificacion de precision historica |
| Extractor de World Bible | DeepSeek V4-Flash | 16384 | Extraccion automatica de Bible desde manuscrito |
| Analizador Arquitectonico | DeepSeek V4-Flash | 16384 | Analisis estructural del manuscrito |
| Corrector Estructural | DeepSeek V4-Flash | 65536 | Correccion de problemas estructurales (con thinking) |
| Reescritor Narrativo | DeepSeek V4-Flash | 65536 | Reescritura completa de capitulos (con thinking) |
| Revisor Final | DeepSeek V4-Flash | 8192 | Evaluacion forense de consistencia |

### Post-produccion
| Agente | Modelo | Tokens Max | Funcion |
|--------|--------|------------|---------|
| Corrector Ortotipografico | DeepSeek V4-Flash | 65536 | Correccion profesional adaptada a genero/autor, detecta glitches IA (thinking: 4K) |

### Adaptacion Literaria Profesional (LitTranslators)
| Agente | Modelo | Tokens Max | Funcion |
|--------|--------|------------|---------|
| Adaptador Literario | DeepSeek V4-Flash | 65536 | Recreacion literaria profesional lista para publicacion |
| Revisor Nativo | DeepSeek V4-Flash | 65536 | Revision como hablante nativo del idioma destino |

### Taller de Guias
| Agente | Modelo | Tokens Max | Funcion |
|--------|--------|------------|---------|
| Generador de Guias | DeepSeek V4-Flash | 32768 | Generacion de guias de estilo y escritura (con thinking) |

### Herramientas de Publicacion
| Agente | Modelo | Tokens Max | Funcion |
|--------|--------|------------|---------|
| Generador de Metadatos KDP | DeepSeek V4-Flash | 16384 | Metadata Amazon KDP (descripcion, keywords, BISAC) |

## Distribucion de Modelos y Costos

Todos los agentes usan **DeepSeek V4-Flash** como unico modelo via API compatible con OpenAI, optimizando costos sin sacrificar calidad.

| Modelo | Uso | Input/M | Output/M | Thinking/M |
|--------|-----|---------|----------|------------|
| DeepSeek V4-Flash | Todos los agentes | $0.14 | $0.28 | $0.28 |

**Reduccion de costos vs Gemini 2.5 Flash**: input ~2.1x mas barato, output ~9x mas barato, thinking ~12.5x mas barato.

### Optimizacion de Tokens
- **System prompts** enviados como primer mensaje del array `messages[]` con rol `system` (formato OpenAI estandar)
- **Thinking desactivado por defecto**: Solo los agentes que lo necesitan (Ghostwriter, Arquitecto, Reestructurador, Expansor, correctores estructurales) lo activan explicitamente
- **Limites de salida por rol**: 65536 (escritores/traductores), 16384 (revisores/analizadores), 8192 (editores), 4096 (validadores/auditores)
- **Contexto deslizante comprimido**: 1 capitulo completo + 4 resumenes, truncados a 5000 caracteres
- **Maximo 10 ciclos de revision final** con deteccion de estancamiento y regresion de puntuacion (auto-revert si la calidad baja 2+ puntos)

## Funcionalidades Avanzadas

### Sistema de Continuidad
- **Validacion inmediata post-escritura**: Cada capitulo se valida antes de pasar al Editor
- **Deteccion de personajes muertos**: 30+ verbos de accion con excepciones para flashbacks
- **Deteccion de pronombres/titulos**: Detecta referencias por pronombre a personajes muertos
- **Prevencion de filtracion de conocimiento**: Los personajes no pueden usar informacion que no poseen
- **Deteccion de drift de apariencia**: Verifica rasgos fisicos contra la World Bible
- **Tracking de objetos**: Previene uso de objetos que el personaje no posee

### World Bible Progresiva
- Se actualiza automaticamente despues de cada capitulo
- Tracking de estado de personajes: ubicacion, heridas, objetos, conocimiento, emociones
- Hilos narrativos pendientes y resueltos
- Decisiones de trama, lesiones persistentes y linea temporal
- El Ghostwriter recibe toda la informacion en formato estructurado y legible

### Notas del Autor
- Instrucciones personalizadas para evitar errores conocidos
- Categorias: continuidad, personaje, trama, estilo, mundo
- Niveles de prioridad: critica, alta, normal, baja
- Se inyectan en los prompts del Ghostwriter y Editor como restricciones obligatorias

### Anti-Repeticion entre Capitulos
- **Ventana deslizante con texto real**: Los 2 capitulos mas recientes se envian con su texto completo (ultimos 8000 caracteres), los 5 siguientes con extractos de 500 caracteres
- **Restricciones explicitas al Ghostwriter**: 7 reglas que prohiben repetir estructura de escenas, patrones de dialogo, mecanismos de revelacion, tipos de finales y recursos literarios
- **Deteccion por el Editor**: Nuevo campo `repeticiones_trama` que compara el capitulo actual contra el texto de 3 capitulos anteriores (4000 chars cada uno)
- **Retroalimentacion en ciclos de correccion**: Si se detectan repeticiones, el Ghostwriter recibe instrucciones especificas para reestructurar usando mecanismos narrativos diferentes

### Modulacion Ritmica
- **Ghostwriter**: Modula longitud de oraciones segun tipo de escena (cortas en tension, largas en transiciones)
- **Editor**: Detecta monotonia ritmica en ambas direcciones (exceso de oraciones cortas o largas)
- **Re-editor**: Aplica las mismas reglas ritmicas durante la reescritura narrativa

### Sistema de Calidad
- Pausa automatica tras 5 evaluaciones no perfectas
- Aprobacion requiere puntuacion 9/10 sin problemas criticos
- Auto-aprobacion tras 3+ ciclos si puntuacion >= 9 y sin issues criticos
- **Deteccion de regresion de puntuacion**: Si las correcciones empeoran la puntuacion (caida de 2+ puntos), el sistema revierte automaticamente los capitulos a la version anterior y pausa para instrucciones del usuario
- **Snapshots pre-correccion**: Antes de aplicar cambios, se guarda una copia de cada capitulo que se va a modificar para poder revertir si la calidad baja
- **Extraccion inteligente de capitulos**: Cuando el revisor no especifica `capitulos_afectados`, el sistema los extrae automaticamente del texto de la descripcion
- **Panel de issues detallado**: Al pausar, la interfaz muestra historial de puntuaciones por ciclo, lista de issues con severidad/categoria/capitulos afectados e instrucciones de correccion
- **Forzar completado**: Boton para finalizar manualmente proyectos de reedicion en cualquier momento
- **Blacklist de formulas fisiologicas**: 23 expresiones prohibidas en el Ghostwriter (nudos en garganta, escalofrios, mandibulas apretadas, etc.)
- **Limites de reacciones y metaforas**: Maximo 3 reacciones fisicas y 3-5 metaforas por capitulo
- Tracking de hashes de issues para evitar re-reportar problemas resueltos
- QA re-ejecuta auditores si hay capitulos modificados en el ciclo

### Critica Editorial
- Acepta feedback externo de editores, beta-readers o criticos profesionales
- Se inyecta en el Reescritor Narrativo como correcciones de alta prioridad
- El Revisor Final lo usa como checklist de verificacion obligatoria
- Disponible al subir manuscritos, al re-editar proyectos del sistema, al reanudar y al reiniciar

### Taller de Guias
- **4 tipos de guia**: Estilo de autor, escritura por idea, identidad de pseudonimo, escritura de serie
- **Guia por Idea**: Genera guia extendida + crea proyecto automaticamente con todos los parametros (capitulos, palabras, pseudonimo, estilo)
- **Guia de Serie Extendida**: Selecciona una serie existente y un pseudonimo, configura el siguiente libro (titulo, capitulos, genero, tono, palabras por capitulo). El sistema analiza todos los libros de la serie para generar una guia contextualizada. Crea automaticamente la guia extendida, el proyecto vinculado a la serie con el orden correcto, y actualiza la guia de serie
- **Estilo de Autor**: Emula el estilo de un autor conocido y lo vincula a un pseudonimo
- **Estilo de Pseudonimo**: Define la identidad literaria unica de un pseudonimo existente
- **Biblioteca**: Visualiza, descarga en Markdown, aplica a pseudonimos o elimina guias generadas

### Gestion de Series
- **Snapshots de continuidad automaticos**: Extrae sinopsis, estado de personajes, hilos pendientes y eventos clave al completar cada libro
- **Verificacion de arcos narrativos**: ArcValidatorAgent valida hitos y progreso de hilos entre volumenes
- **Contexto de serie para el Ghostwriter**: Hilos pendientes de volumenes anteriores inyectados en la World Bible enriquecida
- **Filtrado temporal**: Solo carga contexto de volumenes anteriores, previniendo filtraciones de futuros libros
- **Convertir re-ediciones a serie**: Agrupa multiples manuscritos importados/re-editados en una serie unificada con World Bible fusionada

### Spin-offs
- **Creacion directa**: Boton "Spin-off" en cada tarjeta de serie para crear derivaciones rapidamente
- **Seleccion de protagonista**: Carga automatica de personajes de la serie original para elegir protagonista
- **Guia auto-generada**: Analiza las novelas de la serie original para generar guia de escritura completa del spin-off
- **Contexto heredado**: Perfil del protagonista, reglas del mundo, personajes recurrentes, hilos narrativos heredados
- **Badge visual**: Las series spin-off se identifican con badge y nombre del protagonista

### Adaptacion Literaria Profesional
- **No es traduccion, es recreacion**: El sistema no traduce literalmente — recrea cada capitulo como si un autor nativo lo hubiera escrito desde cero en el idioma destino
- **Adaptacion de expresiones**: Modismos, refranes y expresiones se adaptan a equivalentes naturales del idioma destino
- **Voces de personajes diferenciadas**: Cada personaje mantiene su voz propia adaptada a los recursos del idioma destino
- **Reglas editoriales por idioma**: Tipografia, puntuacion, dialogos y convenciones especificas para cada uno de los 7 idiomas soportados (es, en, fr, de, it, pt, ca)
- **Filtro anti-IA**: Lista de palabras muleta por idioma que la IA tiene prohibido usar, forzando vocabulario literario mas rico y humano
- **Resultado listo para publicacion**: El texto resultante no necesita revision editorial adicional
- **Reanudacion robusta**: Si una adaptacion se interrumpe, se retoma exactamente donde se quedo

### Re-edicion Optimizada de Proyectos del Sistema
- Al re-editar un libro generado por el sistema, se copian automaticamente la World Bible y los capitulos
- El orquestador salta las etapas 1-3 (analisis estructural, revision editorial, extraccion de World Bible) porque ya existen
- Ahorra tiempo y costos de API significativos, yendo directamente al analisis arquitectonico, QA y reescritura narrativa

### Conteo de Palabras y Expansion
- Tolerancia flexible del 10%: `FLEXIBLE_MIN = TARGET_MIN x 0.90`, `FLEXIBLE_MAX = TARGET_MAX x 1.10`
- 5 reintentos dedicados para ajuste de longitud (independientes de los ciclos de edicion)
- Modo expansion: el Ghostwriter recibe el borrador corto y lo expande con detalles sensoriales, dialogo, monologo interno y transiciones
- Filosofia de edicion quirurgica: todas las correcciones modifican solo pasajes problematicos preservando el contenido funcional

### Audiolibros (Text-to-Speech)
- **Conversion TTS**: Genera audiolibros capitulo a capitulo usando Fish Audio (modelo speech-1.6)
- **Voces personalizables**: Seleccion de voces predefinidas o cualquier voz de Fish Audio por ID
- **Velocidad ajustable**: Control de velocidad de narracion (0.5x a 2.0x)
- **Generacion paralela**: Hasta 3 capitulos simultaneos para mayor velocidad
- **Pausa y reanudacion**: Control total sobre el proceso de generacion
- **Portadas**: Subida manual de imagen de portada para el proyecto de audiolibro
- **Descarga en ZIP**: Descarga todos los capitulos generados en un archivo ZIP con metadata
- **Streaming de audio**: Reproduccion directa desde la interfaz web
- **Chunking inteligente**: Capitulos largos (>9500 caracteres) se dividen automaticamente en fragmentos

### Metadatos KDP (Amazon)
- **Generacion automatica**: Subtitulo, descripcion HTML (max 4000 chars), 7 keywords (50 chars c/u), 2 categorias BISAC, info de serie
- **Cumplimiento KDP**: Solo tags HTML permitidos, sin informacion prohibida, keywords sin marcas registradas
- **Declaracion de IA**: Configurada como "ai-assisted" segun politica Amazon 2025
- **Edicion completa**: Todos los campos editables con avisos de limite de caracteres

### Catalogo de Libros y Back Matter
- **Catalogo centralizado**: Registro de obras publicadas por pseudonimo con titulo, idioma, genero y enlace Amazon/ASIN
- **Generacion automatica de Back Matter**: Al exportar, el sistema genera paginas finales profesionales:
  - **Solicitud de resena**: Mensaje compatible con las normas de Amazon
  - **"Otras obras del autor"**: Lista automatica de libros del mismo pseudonimo extraida del catalogo
- **6 idiomas soportados**: Back matter generado en es, en, fr, de, it, pt segun el idioma del proyecto
- **Integrado en exportaciones**: Incluido automaticamente en exportaciones Markdown y DOCX

### Originalidad de Nombres de Personajes
- **Lista negra estatica**: El Arquitecto tiene prohibido usar nombres comunes de IA (Marco, Elena, Vega, Montoya, etc.)
- **Lista negra gestionable**: Tabla `name_blacklist` editable desde la interfaz para agregar nombres prohibidos
- **Nombres dinamicos prohibidos**: El Orquestador extrae todos los nombres de personajes de World Bibles existentes y los pasa como `forbiddenNames` al Arquitecto
- **Excepcion por serie**: Los nombres dentro de la misma serie SI pueden repetirse (personajes recurrentes)
- **Fidelidad del Ghostwriter**: El Ghostwriter usa exclusivamente los nombres definidos en el World Bible

### Exportacion
- Markdown limpio sin artefactos de codigo
- Exportacion a DOCX con formato profesional
- Etiquetas de capitulo localizadas (7 idiomas: es, en, fr, de, it, pt, ca)
- Separacion automatica de parrafos largos (~3-4 oraciones por parrafo)
- Soporte para Prologo, Epilogo y Nota del Autor
- Paginas finales opcionales (Back Matter) con solicitud de resena y catalogo del autor

## Requisitos del Sistema

- Ubuntu 22.04 / 24.04 LTS
- 4GB RAM minimo (8GB recomendado)
- 20GB espacio en disco
- Conexion a internet
- API key de DeepSeek (obligatoria, para todos los agentes)
- API key de Fish Audio (opcional, para audiolibros)

## Preparacion del Servidor Ubuntu

```bash
# Actualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar herramientas basicas
sudo apt install -y curl git wget build-essential
```

## Instalacion Rapida

### Opcion A: Instalacion Interactiva

```bash
# Clonar repositorio
git clone https://github.com/atreyu1968/API-Orchestrator-Optimizado-Deepseek.git
cd API-Orchestrator-Optimizado-Deepseek

# Ejecutar instalador (te pedira las configuraciones)
sudo bash install.sh
```

### Opcion B: Instalacion Desatendida (Sin Interaccion)

```bash
# Clonar repositorio
git clone https://github.com/atreyu1968/API-Orchestrator-Optimizado-Deepseek.git
cd API-Orchestrator-Optimizado-Deepseek

# Instalacion minima
sudo DEEPSEEK_API_KEY="tu-api-key-aqui" bash install.sh --unattended

# Con todas las opciones
sudo DEEPSEEK_API_KEY="tu-deepseek-key" \
     FISH_AUDIO_API_KEY="tu-fish-key" \
     LITAGENTS_PASSWORD="tu-contrasena" \
     CF_TUNNEL_TOKEN="token-cloudflare-opcional" \
     bash install.sh --unattended
```

Tambien puedes usar argumentos de linea de comandos:

```bash
sudo bash install.sh --unattended \
    --deepseek-key="tu-deepseek-key" \
    --fish-key="tu-fish-key" \
    --password="tu-contrasena" \
    --cf-token="token-cloudflare"
```

Ver todas las opciones: `bash install.sh --help`

### Durante la instalacion interactiva

El instalador te pedira:

1. **DEEPSEEK_API_KEY** (obligatorio): API key de DeepSeek para todos los agentes
2. **FISH_AUDIO_API_KEY** (opcional): API key de Fish Audio para generar audiolibros
3. **LITAGENTS_PASSWORD** (opcional): Contrasena para proteger el acceso
4. **Cloudflare Tunnel Token** (opcional): Para acceso HTTPS externo

### Acceder a la aplicacion

```
http://TU_IP_SERVIDOR
```

Si configuraste una contrasena, veras una pantalla de login antes de acceder.

## Obtener API Keys

### DeepSeek (obligatoria)
1. Visita https://platform.deepseek.com/api_keys
2. Crea una cuenta y verifica tu email
3. Genera una API key
4. El sistema usa el modelo `deepseek-v4-flash` con API compatible con OpenAI (`https://api.deepseek.com`)

### Fish Audio (opcional, para audiolibros)
1. Visita https://fish.audio/account/api-key
2. Crea una cuenta y genera una API key
3. El modelo utilizado es `speech-1.6` con voces personalizables

## Comandos de Administracion

```bash
# Ver estado del servicio
systemctl status litagents

# Ver logs en tiempo real
journalctl -u litagents -f

# Reiniciar servicio
sudo systemctl restart litagents

# Detener servicio
sudo systemctl stop litagents

# Actualizar a la ultima version
sudo /var/www/litagents/update.sh

# Crear backup de la base de datos
sudo /var/www/litagents/backup.sh
```

## Actualizacion

```bash
sudo /var/www/litagents/update.sh
```

El script de actualizacion:
1. Verifica y solicita nuevas API keys si es necesario
2. Descarga los ultimos cambios del repositorio
3. Instala nuevas dependencias
4. Ejecuta migraciones de base de datos
5. Recompila la aplicacion
6. Reinicia el servicio

Las credenciales y proyectos existentes se preservan automaticamente.

## Configuracion Manual

```bash
# Editar configuracion
sudo nano /etc/litagents/env

# Reiniciar servicio despues de cambios
sudo systemctl restart litagents
```

## Estructura de Archivos

```
/var/www/litagents/                    # Codigo de la aplicacion
/var/www/litagents/inbox/              # Manuscritos a importar
/var/www/litagents/exports/            # Archivos exportados
/var/www/litagents/audiobooks/         # Archivos de audio generados
/var/www/litagents/audiobooks/covers/  # Portadas de audiolibros
/var/www/litagents/inbox/processed/    # Manuscritos ya procesados
/etc/litagents/env                     # Configuracion y variables de entorno
/etc/systemd/system/litagents.service  # Servicio systemd
/etc/nginx/sites-available/litagents   # Configuracion Nginx
/var/log/litagents/                    # Logs de la aplicacion
```

## Sistema de Archivos del Servidor

En servidores donde no es posible subir archivos desde el navegador, LitAgents permite importar manuscritos directamente desde el sistema de archivos.

### Como Subir Archivos al Servidor

```bash
# Usando SCP (desde tu maquina local)
scp mi_manuscrito.docx usuario@tu-servidor:/var/www/litagents/inbox/

# Usando SFTP
sftp usuario@tu-servidor
cd /var/www/litagents/inbox
put mi_manuscrito.docx
```

### Formatos Soportados

- `.docx` - Microsoft Word (recomendado)
- `.doc` - Microsoft Word antiguo
- `.txt` - Texto plano
- `.md` - Markdown

### Flujo de Trabajo

1. Copia el archivo al directorio `inbox`
2. Abre la interfaz web y ve a "Importar Manuscrito"
3. Selecciona la pestana "Archivos del Servidor"
4. Haz clic en el archivo para cargarlo
5. Configura titulo e idioma y pulsa "Importar"

## Variables de Entorno

| Variable | Descripcion | Requerido |
|----------|-------------|-----------|
| `DATABASE_URL` | URL de conexion PostgreSQL | Si (auto) |
| `SESSION_SECRET` | Secreto para sesiones | Si (auto) |
| `DEEPSEEK_API_KEY` | API key de DeepSeek (todos los agentes) | Si |
| `FISH_AUDIO_API_KEY` | API key de Fish Audio (audiolibros) | Opcional |
| `LITAGENTS_PASSWORD` | Contrasena de acceso | Opcional |
| `SECURE_COOKIES` | true/false para cookies seguras | Si (auto) |
| `PORT` | Puerto de la aplicacion | Si (auto: 5000) |
| `LITAGENTS_INBOX_DIR` | Directorio de entrada de archivos | Opcional (auto) |
| `LITAGENTS_EXPORTS_DIR` | Directorio de exportaciones | Opcional (auto) |

## Acceso Externo con Cloudflare Tunnel

1. Crea un tunel en https://one.dash.cloudflare.com/
2. Obten el token del tunel
3. Ejecuta el instalador y proporciona el token
4. Configura el hostname del tunel apuntando a `http://localhost:5000`

## Solucion de Problemas

### El servicio no inicia

```bash
# Ver logs de error
journalctl -u litagents -n 50

# Verificar configuracion
cat /etc/litagents/env

# Verificar PostgreSQL
systemctl status postgresql
```

### Error de conexion a base de datos

```bash
# Verificar que PostgreSQL esta corriendo
sudo systemctl start postgresql

# Probar conexion manual
sudo -u postgres psql -c "\l"
```

### Login no funciona

Si usas Cloudflare Tunnel, verifica que `SECURE_COOKIES=true` esta configurado.
Sin HTTPS, debe ser `SECURE_COOKIES=false`.

### Permisos de archivos

```bash
# Reparar permisos
sudo chown -R litagents:litagents /var/www/litagents
```

## Backup de Base de Datos

```bash
# Usar script incluido
sudo /var/www/litagents/backup.sh

# O manualmente
sudo -u postgres pg_dump litagents_db > backup_$(date +%Y%m%d).sql

# Restaurar backup
sudo -u postgres psql litagents_db < backup.sql
```

## Desinstalacion

```bash
# Detener y deshabilitar servicio
sudo systemctl stop litagents
sudo systemctl disable litagents

# Eliminar archivos
sudo rm -rf /var/www/litagents
sudo rm -rf /etc/litagents
sudo rm /etc/systemd/system/litagents.service
sudo rm /etc/nginx/sites-enabled/litagents
sudo rm /etc/nginx/sites-available/litagents

# Eliminar base de datos (opcional)
sudo -u postgres psql -c "DROP DATABASE litagents_db;"
sudo -u postgres psql -c "DROP USER litagents;"

# Recargar servicios
sudo systemctl daemon-reload
sudo systemctl restart nginx
```

## PWA (Aplicacion Web Progresiva)

- Instalable en escritorio y movil desde el navegador (Chrome, Edge, Safari)
- Service Worker con estrategia network-first y fallback offline para assets cacheados
- Las rutas `/api/` y `/sse/` (datos en tiempo real) nunca se cachean
- Iconos 192x192 y 512x512 para pantalla de inicio
- Soporte Apple Touch Icon para iOS

## Stack Tecnologico

- **Frontend**: React + TypeScript + Vite + shadcn/ui (PWA)
- **Backend**: Node.js + Express + TypeScript
- **Base de datos**: PostgreSQL + Drizzle ORM
- **IA**: DeepSeek API (modelo `deepseek-v4-flash`) via SDK compatible con OpenAI
- **TTS**: Fish Audio API (modelo speech-1.6) para audiolibros
- **Proxy**: Nginx
- **Proceso**: systemd
- **Idioma**: Interfaz en espanol (`lang="es"`)

## Changelog

### v6.7
- **Migracion completa de Gemini a DeepSeek V4-Flash** para todos los agentes. La integracion con Google Gemini y la seccion de generacion de portadas IA se han eliminado por completo.
- **Unica variable de entorno obligatoria**: `DEEPSEEK_API_KEY`. `GEMINI_API_KEY` ya no se usa.
- **Reduccion de costos drastica**: input 2.1x mas barato, output 9x mas barato, thinking 12.5x mas barato vs Gemini 2.5 Flash.
- **SDK unificado**: Cliente OpenAI con `baseURL: https://api.deepseek.com`, formato estandar de mensajes con rol `system`.
- **Cost tracking refactorizado**: Calculador centralizado de costos como unica fuente de verdad para todos los `ai_usage_events`.
- **Notas editoriales en dos pasos** y demas funciones de v6.6 mantenidas intactas.

### v6.6 — Notas Editoriales en Dos Pasos
- Soporte multi-capitulo en notas editoriales con badges de arco y plan distributivo
- Previsualizacion antes de aplicar con checkboxes para seleccionar instrucciones
- Carga de notas desde archivos `.txt` y `.md`
- Snapshot pre-edicion con diff visual palabra a palabra
- Revision Final automatica post-editorial con flecha de mejora/regresion
- Cancelacion entre capitulos con AbortController

### v6.5
- **Politica de aprobacion 9/10**: Capitulos con puntuacion >= 9 se aprueban siempre, incluso si el Editor detecta hard-rejects (continuidad, filtraciones, repeticiones de trama, inconsistencias de objetos). Las violaciones se anotan para que el Centinela de Continuidad o la auditoria final las traten con reescritura quirurgica. Evita destruir prosa de calidad alta por correcciones marginales.
- **Modo `surgicalEdit` del Narrador**: Nuevo flag que cambia las reglas de reescritura del Ghostwriter para preservar 90%+ del borrador anterior y mantener la longitud (±10%). Sustituye la regla "no reduzcas la extension" (toxica para correcciones post-finalizacion) por "manten la misma longitud". Reintento automatico con presion reforzada si la primera salida cae fuera de rango. Solo si el reintento sigue desbordado, se revierte al original.
- **Reescritura quirurgica con red de seguridad**: `rewriteChapterForQA()` ahora hace backup del contenido original, valida la longitud de la nueva version (80-125% del original o reintento), verifica con el Editor que no se introduzcan nuevas violaciones criticas, y revierte automaticamente al original si la reescritura empeora algo. Aplica a las correcciones del Centinela de Continuidad, Auditor de Voz y Detector Semantico.
- **Anti-estancamiento por intentos sin mejora**: El bucle de refinamiento Editor ahora cuenta `attemptsSinceBestImprovement`. Si pasan 2 intentos consecutivos sin superar la mejor version (independientemente del estado de hard-reject), se detiene y se usa la mejor version. Cubre tanto el plateau perfecto (7,7,7) como el oscilante (7-clean → 7-hardreject → 7-clean) que antes agotaba los 4 intentos en vano.
- **Mejor seleccion de "best version"**: La eleccion entre intentos ahora prioriza versiones limpias sobre versiones con hard-reject, aunque tengan menor puntuacion. Una version 7/10 sin violaciones criticas se prefiere sobre una 9/10 con error de continuidad. Empate se resuelve por puntuacion estricta (`>` en lugar de `>=`) preservando la primera version buena.
- **Centinela de Continuidad — fallback de capitulos**: Cuando ni el modelo ni el regex consiguen identificar capitulos especificos para corregir, se usa el ultimo capitulo del scope del checkpoint como fallback en lugar de dejar el aviso colgado. Garantiza que cada issue detectado tenga un destinatario.
- **Naturalidad de audiolibros mejorada**: Parametros de Fish Audio ajustados (temperature 0.7→0.65, top_p 0.8→0.7, repetition_penalty 1.5→1.2, chunk_length 200) para entonacion mas humana. `prepareTtsText()` ampliado con normalizacion de comillas (« » → "), abreviaturas espanolas (Sr./Sra./Dr./Av./Nº/etc./EE.UU./s.XX), conversion de em-dash a coma para pausas, deduplicacion de puntuacion (!! → !, …) y refuerzo de puntuacion final por parrafo.

### v6.1
- **Corrector Ortotipografico**: Nuevo agente de post-produccion para correccion profesional adaptada a genero y estilo del autor. Detecta glitches de IA (parrafos clonados, dialogos rotos, bucles de accion). Soporta las 4 fuentes: proyectos, re-ediciones, importados y traducciones. Aplica correcciones directamente al manuscrito original.
- **Thinking Budget Optimizado**: Presupuestos de pensamiento configurables por agente. Ghostwriter: 10K tokens (antes 1K), Arquitecto: 8K, Corrector/Copyeditor: 8K, Editor: 4K (antes sin thinking), Revisor Final: 4K (antes sin thinking). Mejora drastica en la tasa de aprobacion de capitulos.
- **Editor y Revisor Final con Thinking**: Ambos agentes ahora usan thinking para evaluaciones mas profundas y consistentes.

### v6.0
- Version inicial con 13+ agentes especializados
- Re-editor de manuscritos (LitEditors)
- Adaptacion literaria profesional (LitTranslators)
- Spin-offs de series
- Critica editorial en re-ediciones
- Optimizacion clone-to-reedit (skip stages 1-3)
- Audiolibros con Fish Audio TTS
- Metadatos KDP
- Catalogo de libros y back matter
- PWA instalable

## Licencia

MIT License

## Soporte

Para reportar problemas o solicitar funciones, abre un issue en el repositorio de GitHub:
https://github.com/atreyu1968/API-Orchestrator-Optimizado-Deepseek
