#!/bin/bash
set -e

# ============================================================
# Autoinstalador para EscritorasdGemini (LitAgents)
# Compatible con Ubuntu 22.04/24.04
# Repositorio: https://github.com/atreyu1968/escritorasdgemini
# 
# Uso desatendido:
#   GEMINI_API_KEY="tu-key" bash install.sh --unattended
#
# Variables de entorno opcionales:
#   GEMINI_API_KEY          - (Requerido) API key de Google Gemini
#   LITAGENTS_PASSWORD      - (Opcional) Contrasena de acceso
#   CF_TUNNEL_TOKEN         - (Opcional) Token de Cloudflare Tunnel
# ============================================================

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[OK]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[AVISO]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }
print_header() { echo -e "\n${CYAN}═══════════════════════════════════════════════════════════════${NC}"; echo -e "${CYAN} $1${NC}"; echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}\n"; }

# Configuración del proyecto
APP_NAME="litagents"
APP_DIR="/var/www/$APP_NAME"
CONFIG_DIR="/etc/$APP_NAME"
LOG_DIR="/var/log/$APP_NAME"
APP_PORT="5000"
APP_USER="litagents"
DB_NAME="litagents_db"
DB_USER="litagents"
GITHUB_REPO="https://github.com/atreyu1968/escritorasdgemini.git"

# Modo de instalación
UNATTENDED=false

# Parsear argumentos de línea de comandos
while [[ $# -gt 0 ]]; do
    case $1 in
        --unattended|-u)
            UNATTENDED=true
            shift
            ;;
        --gemini-key=*)
            GEMINI_API_KEY="${1#*=}"
            shift
            ;;
        --password=*)
            LITAGENTS_PASSWORD="${1#*=}"
            shift
            ;;
        --cf-token=*)
            CF_TUNNEL_TOKEN="${1#*=}"
            shift
            ;;
        --help|-h)
            echo "Uso: sudo bash install.sh [opciones]"
            echo ""
            echo "Opciones:"
            echo "  --unattended, -u              Instalación sin interacción"
            echo "  --gemini-key=KEY              API key de Google Gemini (requerido)"
            echo "  --password=PASS               Contrasena de acceso (opcional)"
            echo "  --cf-token=TOKEN              Token de Cloudflare Tunnel (opcional)"
            echo "  --help, -h                    Mostrar esta ayuda"
            echo ""
            echo "Ejemplo desatendido:"
            echo "  GEMINI_API_KEY=\"tu-key\" sudo bash install.sh --unattended"
            echo ""
            echo "  O con argumentos:"
            echo "  sudo bash install.sh --unattended --gemini-key=\"tu-key\" --password=\"secreto\""
            exit 0
            ;;
        *)
            print_error "Opción desconocida: $1"
            echo "Usa --help para ver las opciones disponibles"
            exit 1
            ;;
    esac
done

# Verificar que se ejecuta como root
if [ "$EUID" -ne 0 ]; then
    print_error "Este script debe ejecutarse como root"
    echo "Uso: sudo bash install.sh"
    exit 1
fi

# Guardar variables de entorno proporcionadas antes de cargar config existente
PROVIDED_GEMINI_API_KEY="${GEMINI_API_KEY:-}"
PROVIDED_LITAGENTS_PASSWORD="${LITAGENTS_PASSWORD:-}"
PROVIDED_CF_TUNNEL_TOKEN="${CF_TUNNEL_TOKEN:-}"

print_header "INSTALADOR DE LITAGENTS (EscritorasdGemini)"
echo "Este script instalará y configurará la aplicación completa."
echo ""

if [ "$UNATTENDED" = true ]; then
    print_status "Modo desatendido activado"
fi

# Detectar si es una actualización
IS_UPDATE=false
if [ -f "$CONFIG_DIR/env" ]; then
    IS_UPDATE=true
    print_warning "Instalación existente detectada. Se realizará una ACTUALIZACIÓN."
    print_status "Las credenciales y configuración se preservarán."
    source "$CONFIG_DIR/env"
    
    # Restaurar variables proporcionadas (tienen prioridad sobre las existentes)
    [ -n "$PROVIDED_GEMINI_API_KEY" ] && GEMINI_API_KEY="$PROVIDED_GEMINI_API_KEY"
    [ -n "$PROVIDED_LITAGENTS_PASSWORD" ] && LITAGENTS_PASSWORD="$PROVIDED_LITAGENTS_PASSWORD"
    [ -n "$PROVIDED_CF_TUNNEL_TOKEN" ] && CF_TUNNEL_TOKEN="$PROVIDED_CF_TUNNEL_TOKEN"
else
    print_status "Instalación nueva detectada."
fi

# Confirmación (solo en modo interactivo)
if [ "$UNATTENDED" = false ]; then
    echo ""
    read -p "¿Continuar con la instalación? (s/N): " CONFIRM
    if [[ ! "$CONFIRM" =~ ^[Ss]$ ]]; then
        echo "Instalación cancelada."
        exit 0
    fi
fi

# ============================================================
# PASO 1: Solicitar API Keys (solo instalación nueva)
# ============================================================
print_header "PASO 1: Configuración de API Keys"

if [ "$IS_UPDATE" = false ]; then
    if [ "$UNATTENDED" = true ]; then
        # Modo desatendido: usar variables de entorno
        if [ -z "$GEMINI_API_KEY" ]; then
            print_error "La variable GEMINI_API_KEY es obligatoria en modo desatendido"
            echo "Uso: GEMINI_API_KEY=\"tu-key\" sudo bash install.sh --unattended"
            exit 1
        fi
        print_success "Usando GEMINI_API_KEY desde variable de entorno"
        
        LITAGENTS_PASSWORD="${LITAGENTS_PASSWORD:-}"
        CF_TOKEN="${CF_TUNNEL_TOKEN:-}"
    else
        # Modo interactivo: solicitar al usuario
        echo "Necesitas proporcionar tu API key de Google Gemini."
        echo "Puedes obtenerla en: https://aistudio.google.com/apikey"
        echo ""
        
        read -p "GEMINI_API_KEY: " INPUT_GEMINI_KEY
        if [ -z "$INPUT_GEMINI_KEY" ]; then
            print_error "La API key de Gemini es obligatoria"
            exit 1
        fi
        GEMINI_API_KEY="$INPUT_GEMINI_KEY"
        
        echo ""
        echo "=== Configuracion de Seguridad ==="
        echo "(Opcional) Configura una contrasena para proteger el acceso a la aplicacion."
        echo "Presiona Enter para omitir (acceso sin contrasena)."
        read -sp "LITAGENTS_PASSWORD (opcional): " INPUT_PASSWORD
        echo ""
        LITAGENTS_PASSWORD="${INPUT_PASSWORD:-}"
    fi
    
    if [ -n "$LITAGENTS_PASSWORD" ]; then
        print_success "Contrasena configurada"
    else
        print_status "Acceso sin contrasena (cualquiera podra acceder)"
    fi
    
    # Generar credenciales
    DB_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
    SESSION_SECRET=$(openssl rand -base64 32)
    
    print_success "API Keys configuradas"
else
    print_status "Usando credenciales existentes de $CONFIG_DIR/env"
fi

# ============================================================
# PASO 2: Actualizar sistema e instalar dependencias
# ============================================================
print_header "PASO 2: Instalando dependencias del sistema"

print_status "Actualizando repositorios..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq

print_status "Instalando paquetes base..."
apt-get install -y -qq curl git build-essential

print_status "Instalando Nginx..."
apt-get install -y -qq nginx
apt-mark manual nginx > /dev/null 2>&1

print_status "Instalando PostgreSQL..."
apt-get install -y -qq postgresql postgresql-contrib

# Asegurar que PostgreSQL está corriendo
systemctl enable postgresql > /dev/null 2>&1
systemctl start postgresql

print_success "Dependencias del sistema instaladas"

# ============================================================
# PASO 3: Instalar Node.js 20.x
# ============================================================
print_header "PASO 3: Instalando Node.js 20.x"

if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    if [[ "$NODE_VERSION" == v20* ]]; then
        print_status "Node.js $NODE_VERSION ya está instalado"
    else
        print_status "Actualizando Node.js a v20..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
        apt-get install -y -qq nodejs
    fi
else
    print_status "Instalando Node.js 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
    apt-get install -y -qq nodejs
fi

# Asegurar permisos correctos
chmod 755 /usr/bin/node 2>/dev/null || true
chmod 755 /usr/bin/npm 2>/dev/null || true

print_success "Node.js $(node -v) instalado"

# ============================================================
# PASO 4: Configurar PostgreSQL
# ============================================================
print_header "PASO 4: Configurando base de datos PostgreSQL"

if [ "$IS_UPDATE" = false ]; then
    print_status "Creando usuario y base de datos..."
    
    # Verificar si el usuario ya existe
    if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
        print_warning "Usuario $DB_USER ya existe, actualizando contraseña..."
        sudo -u postgres psql -c "ALTER USER $DB_USER WITH PASSWORD '$DB_PASS';" > /dev/null 2>&1
    else
        sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';" > /dev/null 2>&1
    fi
    
    # Verificar si la base de datos ya existe
    if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
        print_warning "Base de datos $DB_NAME ya existe"
    else
        sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" > /dev/null 2>&1
    fi
    
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" > /dev/null 2>&1
    
    # Asegurar que pg_hba.conf permite conexiones md5
    PG_HBA=$(sudo -u postgres psql -t -c "SHOW hba_file" | xargs)
    if ! grep -q "local.*$DB_NAME.*$DB_USER.*md5" "$PG_HBA" 2>/dev/null; then
        echo "local   $DB_NAME   $DB_USER   md5" | sudo tee -a "$PG_HBA" > /dev/null
        systemctl reload postgresql
    fi
    
    print_success "Base de datos configurada"
else
    print_status "Base de datos existente, omitiendo creación"
fi

# ============================================================
# PASO 5: Crear usuario del sistema
# ============================================================
print_header "PASO 5: Configurando usuario del sistema"

if id "$APP_USER" &>/dev/null; then
    print_status "Usuario $APP_USER ya existe"
else
    useradd --system --create-home --shell /bin/bash "$APP_USER"
    print_success "Usuario $APP_USER creado"
fi

# ============================================================
# PASO 6: Configuración persistente
# ============================================================
print_header "PASO 6: Guardando configuración"

mkdir -p "$CONFIG_DIR"
mkdir -p "$LOG_DIR"
mkdir -p "$APP_DIR"
mkdir -p "$APP_DIR/inbox"
mkdir -p "$APP_DIR/inbox/processed"
mkdir -p "$APP_DIR/exports"
chown "$APP_USER:$APP_USER" "$LOG_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR/inbox"
chown -R "$APP_USER:$APP_USER" "$APP_DIR/exports"

if [ "$IS_UPDATE" = true ]; then
    # En actualizaciones, preservar la configuración existente
    print_status "Preservando configuración existente..."
    
    # Solo actualizar API keys si se proporcionaron nuevas
    if [ -n "$GEMINI_API_KEY" ] && [ "$GEMINI_API_KEY" != "$(grep -oP 'GEMINI_API_KEY=\K.*' "$CONFIG_DIR/env" 2>/dev/null)" ]; then
        sed -i "s|^GEMINI_API_KEY=.*|GEMINI_API_KEY=$GEMINI_API_KEY|" "$CONFIG_DIR/env"
        print_status "API key de Gemini actualizada"
    fi
    
    # Asegurar que existen los directorios de archivos en la config
    if ! grep -q "LITAGENTS_INBOX_DIR" "$CONFIG_DIR/env" 2>/dev/null; then
        echo "LITAGENTS_INBOX_DIR=$APP_DIR/inbox" >> "$CONFIG_DIR/env"
        echo "LITAGENTS_EXPORTS_DIR=$APP_DIR/exports" >> "$CONFIG_DIR/env"
    fi
    
    print_success "Configuración preservada"
else
    # Nueva instalación: crear archivo de configuración completo
    DATABASE_URL="postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME"
    
    cat > "$CONFIG_DIR/env" << EOF
NODE_ENV=production
PORT=$APP_PORT
DATABASE_URL=$DATABASE_URL
SESSION_SECRET=$SESSION_SECRET
GEMINI_API_KEY=$GEMINI_API_KEY
LITAGENTS_PASSWORD=$LITAGENTS_PASSWORD
SECURE_COOKIES=false
LITAGENTS_INBOX_DIR=$APP_DIR/inbox
LITAGENTS_EXPORTS_DIR=$APP_DIR/exports
EOF
    
    chmod 600 "$CONFIG_DIR/env"
    chown root:root "$CONFIG_DIR/env"
    
    print_success "Configuración guardada en $CONFIG_DIR/env"
fi

# ============================================================
# PASO 7: Clonar/Actualizar código
# ============================================================
print_header "PASO 7: Descargando código fuente"

git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true

if [ -d "$APP_DIR/.git" ]; then
    print_status "Actualizando repositorio existente..."
    cd "$APP_DIR"
    sudo -u "$APP_USER" git fetch --all
    sudo -u "$APP_USER" git reset --hard origin/main
else
    print_status "Clonando repositorio..."
    rm -rf "$APP_DIR"
    git clone --depth 1 "$GITHUB_REPO" "$APP_DIR"
    
    # Recrear directorios después de clonar
    mkdir -p "$APP_DIR/inbox"
    mkdir -p "$APP_DIR/inbox/processed"
    mkdir -p "$APP_DIR/exports"
fi

chown -R "$APP_USER:$APP_USER" "$APP_DIR"
print_success "Código descargado en $APP_DIR"

# ============================================================
# PASO 8: Instalar dependencias y compilar
# ============================================================
print_header "PASO 8: Instalando dependencias de Node.js"

cd "$APP_DIR"

# Cargar variables de entorno para el build
set -a
source "$CONFIG_DIR/env"
set +a

print_status "Ejecutando npm install..."
sudo -u "$APP_USER" npm install --legacy-peer-deps 2>&1 | tail -5

print_status "Compilando aplicación..."
sudo -u "$APP_USER" npm run build 2>&1 | tail -5

print_status "Ejecutando migraciones de base de datos..."
sudo -u "$APP_USER" npm run db:push 2>&1 | tail -3

print_status "Aplicando migraciones SQL adicionales..."
for migration in "$APP_DIR"/migrations/*.sql; do
    if [ -f "$migration" ]; then
        print_status "  $(basename "$migration")..."
        sudo -u "$APP_USER" psql "$DATABASE_URL" -f "$migration" 2>/dev/null || true
    fi
done

print_success "Aplicación compilada"

# ============================================================
# PASO 9: Configurar servicio systemd
# ============================================================
print_header "PASO 9: Configurando servicio systemd"

# Obtener rutas de inbox/exports desde config
INBOX_DIR="${LITAGENTS_INBOX_DIR:-$APP_DIR/inbox}"
EXPORTS_DIR="${LITAGENTS_EXPORTS_DIR:-$APP_DIR/exports}"

cat > "/etc/systemd/system/$APP_NAME.service" << EOF
[Unit]
Description=LitAgents Application
Documentation=https://github.com/atreyu1968/escritorasdgemini
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$CONFIG_DIR/env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
StandardOutput=append:$LOG_DIR/app.log
StandardError=append:$LOG_DIR/error.log

# Límites de recursos
LimitNOFILE=65535
MemoryMax=2G

# Seguridad
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$APP_DIR $LOG_DIR $INBOX_DIR $EXPORTS_DIR

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$APP_NAME" > /dev/null 2>&1
systemctl restart "$APP_NAME"

# Esperar a que inicie
sleep 3

if systemctl is-active --quiet "$APP_NAME"; then
    print_success "Servicio $APP_NAME iniciado correctamente"
else
    print_error "Error al iniciar el servicio"
    journalctl -u "$APP_NAME" -n 20 --no-pager
fi

# ============================================================
# PASO 10: Configurar Nginx
# ============================================================
print_header "PASO 10: Configurando Nginx"

cat > "/etc/nginx/sites-available/$APP_NAME" << 'EOF'
server {
    listen 80;
    server_name _;
    
    client_max_body_size 500M;
    
    # Logs
    access_log /var/log/nginx/litagents_access.log;
    error_log /var/log/nginx/litagents_error.log;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts largos para operaciones de AI
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
    }

    # SSE (Server-Sent Events) para el dashboard
    location /api/projects/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
        proxy_read_timeout 86400s;
    }
}
EOF

# Activar sitio
ln -sf "/etc/nginx/sites-available/$APP_NAME" /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Verificar configuración
if nginx -t > /dev/null 2>&1; then
    systemctl restart nginx
    print_success "Nginx configurado correctamente"
else
    print_error "Error en la configuración de Nginx"
    nginx -t
fi

# ============================================================
# PASO 11: Configurar firewall (UFW)
# ============================================================
print_header "PASO 11: Configurando firewall"

if command -v ufw &> /dev/null; then
    ufw allow OpenSSH > /dev/null 2>&1
    ufw allow 'Nginx Full' > /dev/null 2>&1
    
    if ! ufw status | grep -q "Status: active"; then
        print_warning "UFW no está activo. Puedes activarlo con: sudo ufw enable"
    else
        print_success "Firewall configurado"
    fi
else
    print_warning "UFW no instalado. Instálalo con: apt install ufw"
fi

# ============================================================
# PASO 12: Cloudflare Tunnel (opcional)
# ============================================================
print_header "PASO 12: Cloudflare Tunnel (opcional)"

# Usar variable de entorno o argumento si está disponible
CF_TOKEN="${CF_TUNNEL_TOKEN:-$PROVIDED_CF_TUNNEL_TOKEN}"

if [ "$UNATTENDED" = true ]; then
    if [ -n "$CF_TOKEN" ]; then
        print_status "Configurando Cloudflare Tunnel desde variable de entorno..."
    else
        print_status "Cloudflare Tunnel omitido (no se proporcionó CF_TUNNEL_TOKEN)"
    fi
else
    if [ -z "$CF_TOKEN" ]; then
        echo "Si tienes un Cloudflare Tunnel, puedes configurarlo ahora."
        echo "Esto te permite acceder a la aplicación desde internet sin abrir puertos."
        echo "Puedes obtener el token en: https://one.dash.cloudflare.com/"
        echo ""
        read -p "Token de Cloudflare Tunnel (Enter para omitir): " CF_TOKEN
    fi
fi

if [ -n "$CF_TOKEN" ]; then
    print_status "Instalando cloudflared..."
    
    # Descargar e instalar cloudflared
    curl -L -o /tmp/cloudflared.deb \
        https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb 2>/dev/null
    dpkg -i /tmp/cloudflared.deb > /dev/null 2>&1
    rm -f /tmp/cloudflared.deb
    
    # Detener servicio existente si hay
    systemctl stop cloudflared 2>/dev/null || true
    
    # Instalar servicio con token
    cloudflared service install "$CF_TOKEN" 2>/dev/null || true
    systemctl enable cloudflared > /dev/null 2>&1
    systemctl start cloudflared
    
    # Habilitar cookies seguras (Cloudflare = HTTPS)
    sed -i 's/SECURE_COOKIES=false/SECURE_COOKIES=true/' "$CONFIG_DIR/env"
    systemctl restart "$APP_NAME"
    
    if systemctl is-active --quiet cloudflared; then
        print_success "Cloudflare Tunnel configurado"
    else
        print_warning "Cloudflare Tunnel instalado pero puede requerir configuración adicional"
    fi
else
    print_status "Cloudflare Tunnel omitido"
fi

# ============================================================
# PASO 13: Crear script de actualización
# ============================================================
print_header "PASO 13: Creando scripts de utilidad"

# Script de actualización
cat > "$APP_DIR/update.sh" << 'UPDATEEOF'
#!/bin/bash
set -e

APP_DIR="/var/www/litagents"
APP_USER="litagents"

echo "=== Actualizando LitAgents ==="

cd "$APP_DIR"

# Cargar variables de entorno
set -a
source /etc/litagents/env
set +a

echo "1. Obteniendo últimos cambios..."
sudo -u "$APP_USER" git fetch --all
sudo -u "$APP_USER" git reset --hard origin/main

echo "2. Instalando dependencias..."
sudo -u "$APP_USER" npm install --legacy-peer-deps

echo "3. Ejecutando migraciones de base de datos..."
DB_USER_PARSED=$(echo "$DATABASE_URL" | sed -n 's|postgresql://\([^:]*\):.*|\1|p')
DB_PASS_PARSED=$(echo "$DATABASE_URL" | sed -n 's|postgresql://[^:]*:\([^@]*\)@.*|\1|p')
DB_HOST_PARSED=$(echo "$DATABASE_URL" | sed -n 's|postgresql://[^@]*@\([^:]*\):.*|\1|p')
DB_PORT_PARSED=$(echo "$DATABASE_URL" | sed -n 's|postgresql://[^:]*:[^@]*@[^:]*:\([^/]*\)/.*|\1|p')
DB_NAME_PARSED=$(echo "$DATABASE_URL" | sed -n 's|postgresql://[^/]*/\(.*\)|\1|p')

for migration in "$APP_DIR"/migrations/*.sql; do
    if [ -f "$migration" ]; then
        echo "   Aplicando $(basename "$migration")..."
        PGPASSWORD="$DB_PASS_PARSED" psql -U "$DB_USER_PARSED" -h "$DB_HOST_PARSED" -p "$DB_PORT_PARSED" "$DB_NAME_PARSED" -f "$migration" 2>/dev/null || true
    fi
done

echo "4. Compilando aplicación..."
sudo -u "$APP_USER" npm run build

echo "5. Reiniciando servicio..."
sudo systemctl restart litagents

echo "=== Actualización completada ==="
systemctl status litagents --no-pager -l
UPDATEEOF

chmod +x "$APP_DIR/update.sh"
chown "$APP_USER:$APP_USER" "$APP_DIR/update.sh"

# Script de backup
cat > "$APP_DIR/backup.sh" << 'EOF'
#!/bin/bash
set -e

BACKUP_DIR="/var/backups/litagents"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

echo "Creando backup de base de datos..."
source /etc/litagents/env

# Extraer credenciales de DATABASE_URL
# Formato: postgresql://user:password@host:port/database
DB_USER=$(echo "$DATABASE_URL" | sed -n 's|postgresql://\([^:]*\):.*|\1|p')
DB_PASS=$(echo "$DATABASE_URL" | sed -n 's|postgresql://[^:]*:\([^@]*\)@.*|\1|p')
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|postgresql://[^@]*@\([^:]*\):.*|\1|p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|postgresql://[^:]*:[^@]*@[^:]*:\([^/]*\)/.*|\1|p')
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's|postgresql://[^/]*/\(.*\)|\1|p')

PGPASSWORD="$DB_PASS" pg_dump -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" "$DB_NAME" > "$BACKUP_DIR/db_$DATE.sql"

echo "Backup guardado en: $BACKUP_DIR/db_$DATE.sql"

# Mantener solo los últimos 7 backups
ls -t "$BACKUP_DIR"/db_*.sql | tail -n +8 | xargs -r rm

echo "Backups disponibles:"
ls -lh "$BACKUP_DIR"
EOF

chmod +x "$APP_DIR/backup.sh"

print_success "Scripts de utilidad creados"

# ============================================================
# RESUMEN FINAL
# ============================================================
print_header "INSTALACIÓN COMPLETADA"

SERVER_IP=$(hostname -I | awk '{print $1}')

echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              LitAgents instalado correctamente               ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Acceso:${NC}"
echo "  URL Local:     http://$SERVER_IP"
if [ -n "$CF_TOKEN" ]; then
echo "  URL Cloudflare: Revisa tu dashboard de Cloudflare"
fi
echo ""
echo -e "${CYAN}Directorios de archivos:${NC}"
echo "  Entrada (inbox): $APP_DIR/inbox"
echo "  Exportaciones:   $APP_DIR/exports"
echo ""
echo -e "${CYAN}Comandos útiles:${NC}"
echo "  Estado:        sudo systemctl status $APP_NAME"
echo "  Logs:          sudo journalctl -u $APP_NAME -f"
echo "  Reiniciar:     sudo systemctl restart $APP_NAME"
echo "  Actualizar:    sudo $APP_DIR/update.sh"
echo "  Backup:        sudo $APP_DIR/backup.sh"
echo ""
echo -e "${CYAN}Subir manuscritos:${NC}"
echo "  scp archivo.docx usuario@$SERVER_IP:$APP_DIR/inbox/"
echo ""
echo -e "${CYAN}Archivos importantes:${NC}"
echo "  Configuración: $CONFIG_DIR/env"
echo "  Aplicación:    $APP_DIR"
echo "  Logs:          $LOG_DIR"
echo ""
echo -e "${YELLOW}Nota: Las cookies están configuradas como HTTP (no seguras).${NC}"
echo -e "${YELLOW}Si usas HTTPS, edita $CONFIG_DIR/env y cambia SECURE_COOKIES=true${NC}"
echo ""
