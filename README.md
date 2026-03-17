# LitAgents - Sistema de Orquestacion de Agentes Literarios IA

Sistema autonomo de orquestacion de agentes de IA para la escritura, edicion, traduccion y produccion de novelas completas usando Google Gemini.

**PWA instalable** — se puede instalar en escritorio y movil directamente desde el navegador.

## Caracteristicas Principales

- **Generador de Novelas**: Pipeline completo con 13+ agentes especializados para escribir novelas de principio a fin
- **Re-editor de Manuscritos (LitEditors)**: Importa y edita profesionalmente manuscritos externos en multiples idiomas
- **Adaptacion Literaria Profesional (LitTranslators)**: Sistema de adaptacion literaria (no traduccion literal) con resultado listo para publicacion
- **World Bible Progresiva**: Base de datos de consistencia que se enriquece automaticamente capitulo a capitulo
- **Notas del Autor**: Instrucciones personalizadas para que los agentes eviten errores conocidos
- **Zero Continuity Errors**: Validacion inmediata post-escritura, deteccion de personajes muertos, filtraciones de conocimiento y drift de apariencia
- **Anti-Repeticion entre Capitulos**: Ventana deslizante con texto real de capitulos anteriores y deteccion de patrones narrativos repetidos
- **Seguimiento de Costos**: Tracking granular de uso de tokens por proyecto y modelo
- **Autenticacion**: Proteccion con contrasena para instalaciones en servidor propio
- **PWA**: Aplicacion web progresiva instalable con soporte offline

## Agentes del Sistema

### Generador de Novelas
| Agente | Modelo | Funcion |
|--------|--------|---------|
| Arquitecto Global | Gemini 3 Pro | Planificacion de estructura narrativa y World Bible |
| Ghostwriter | Gemini 3 Pro | Escritura creativa de capitulos completos |
| Editor | Gemini 2.5 Flash | Evaluacion de calidad y plan quirurgico de correcciones |
| Corrector (Copyeditor) | Gemini 2.5 Flash | Correccion de estilo y gramatica |
| Revisor Final | Gemini 3 Pro | Evaluacion completa del manuscrito con auditoria forense |
| Centinela de Continuidad | Gemini 2.5 Flash | Validacion de consistencia post-escritura |
| Auditor de Voz y Ritmo | Gemini 2.5 Flash | Deteccion de problemas de ritmo narrativo |
| Detector de Repeticiones | Gemini 2.5 Flash | Deteccion de repeticiones semanticas y lexicas |
| Validador de Arcos | Gemini 2.5 Flash | Verificacion de arcos narrativos de personajes |

### Expansion y Reestructuracion
| Agente | Modelo | Funcion |
|--------|--------|---------|
| Analizador de Expansion | Gemini 2.5 Flash | Identifica capitulos cortos y gaps narrativos |
| Expansor de Capitulos | Gemini 3 Pro | Expande capitulos cortos manteniendo coherencia |
| Generador de Capitulos Nuevos | Gemini 3 Pro | Inserta capitulos nuevos para llenar gaps |
| Reestructurador | Gemini 2.5 Flash | Reordena capitulos para mejor pacing |

### Re-editor (LitEditors)
| Agente | Modelo | Funcion |
|--------|--------|---------|
| Analizador de Manuscritos | Gemini 2.0 Flash | Extraccion y analisis de manuscritos importados |
| Revisor Final | Gemini 3 Pro | Evaluacion forense de consistencia |
| Corrector | Gemini 2.5 Flash | Correccion de estilo |

### Adaptacion Literaria Profesional (LitTranslators)
| Agente | Modelo | Funcion |
|--------|--------|---------|
| Adaptador Literario | Gemini 2.5 Flash | Recreacion literaria profesional lista para publicacion |
| Revisor Nativo | Gemini 2.5 Flash | Revision como hablante nativo del idioma destino |

## Distribucion de Modelos (Calidad/Costo)

- **Gemini 3 Pro Preview**: Tareas creativas y de razonamiento profundo (escritura, planificacion, revision final)
- **Gemini 2.5 Flash**: Tareas de edicion, validacion, correccion y traduccion (rapido y economico)
- **Gemini 2.0 Flash**: Analisis basico de manuscritos importados (el mas rapido)

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

### Sistema de Calidad
- Pausa automatica tras multiples evaluaciones no perfectas
- Aprobacion requiere puntuacion 9+ sin problemas criticos
- Tracking de hashes de issues para evitar re-reportar problemas resueltos
- QA re-ejecuta auditores si hay capitulos modificados en el ciclo

### Adaptacion Literaria Profesional
- **No es traduccion, es recreacion**: El sistema no traduce literalmente — recrea cada capitulo como si un autor nativo lo hubiera escrito desde cero en el idioma destino
- **Adaptacion de expresiones**: Modismos, refranes y expresiones se adaptan a equivalentes naturales del idioma destino (no se traducen literalmente)
- **Voces de personajes diferenciadas**: Cada personaje mantiene su voz propia adaptada a los recursos del idioma destino
- **Reglas editoriales por idioma**: Tipografia, puntuacion, dialogos y convenciones especificas para cada uno de los 7 idiomas soportados (es, en, fr, de, it, pt, ca)
- **Filtro anti-IA**: Lista de palabras muleta por idioma que la IA tiene prohibido usar, forzando vocabulario literario mas rico y humano
- **Resultado listo para publicacion**: El texto resultante no necesita revision editorial adicional — sale listo para imprimir
- **Contenido editado como fuente**: Siempre usa la version editada y pulida del capitulo, no el borrador original
- **Reanudacion robusta**: Si una adaptacion se interrumpe, se retoma exactamente donde se quedo sin duplicar ni perder capitulos

### Exportacion
- Markdown limpio sin artefactos de codigo
- Etiquetas de capitulo localizadas (7 idiomas: es, en, fr, de, it, pt, ca)
- Soporte para Prologo, Epilogo y Nota del Autor

## Requisitos del Sistema

- Ubuntu 22.04 / 24.04 LTS
- 4GB RAM minimo (8GB recomendado)
- 20GB espacio en disco
- Conexion a internet
- API key de Google Gemini

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
git clone https://github.com/atreyu1968/escritorasdgemini.git
cd escritorasdgemini

# Ejecutar instalador (te pedira las configuraciones)
sudo bash install.sh
```

### Opcion B: Instalacion Desatendida (Sin Interaccion)

```bash
# Clonar repositorio
git clone https://github.com/atreyu1968/escritorasdgemini.git
cd escritorasdgemini

# Instalacion minima
sudo GEMINI_API_KEY="tu-api-key-aqui" bash install.sh --unattended

# Con contrasena y Cloudflare Tunnel
sudo GEMINI_API_KEY="tu-api-key" \
     LITAGENTS_PASSWORD="tu-contrasena" \
     CF_TUNNEL_TOKEN="token-cloudflare-opcional" \
     bash install.sh --unattended
```

Tambien puedes usar argumentos de linea de comandos:

```bash
sudo bash install.sh --unattended \
    --gemini-key="tu-api-key" \
    --password="tu-contrasena" \
    --cf-token="token-cloudflare"
```

Ver todas las opciones: `bash install.sh --help`

### Durante la instalacion interactiva

El instalador te pedira:

1. **GEMINI_API_KEY** (obligatorio): API key de Google Gemini
2. **LITAGENTS_PASSWORD** (opcional): Contrasena para proteger el acceso
3. **Cloudflare Tunnel Token** (opcional): Para acceso HTTPS externo

### Acceder a la aplicacion

```
http://TU_IP_SERVIDOR
```

Si configuraste una contrasena, veras una pantalla de login antes de acceder.

## Obtener API Key de Gemini

1. Visita https://aistudio.google.com/apikey
2. Crea un proyecto y habilita la API
3. Genera una API key

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
1. Descarga los ultimos cambios del repositorio
2. Instala nuevas dependencias
3. Ejecuta migraciones de base de datos
4. Recompila la aplicacion
5. Reinicia el servicio

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
| `GEMINI_API_KEY` | API key de Google Gemini | Si |
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

### PWA (Aplicacion Web Progresiva)
- Instalable en escritorio y movil desde el navegador (Chrome, Edge, Safari)
- Service Worker con estrategia network-first y fallback offline para assets cacheados
- Las rutas `/api/` y `/sse/` (datos en tiempo real) nunca se cachean
- Iconos 192x192 y 512x512 para pantalla de inicio
- Soporte Apple Touch Icon para iOS

## Stack Tecnologico

- **Frontend**: React + TypeScript + Vite + shadcn/ui (PWA)
- **Backend**: Node.js + Express + TypeScript
- **Base de datos**: PostgreSQL + Drizzle ORM
- **IA**: Google Gemini API (Gemini 3 Pro, 2.5 Flash, 2.0 Flash)
- **Proxy**: Nginx
- **Proceso**: systemd
- **Idioma**: Interfaz en espanol (`lang="es"`)

## Licencia

MIT License

## Soporte

Para reportar problemas o solicitar funciones, abre un issue en el repositorio de GitHub:
https://github.com/atreyu1968/escritorasdgemini
