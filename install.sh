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
#   FISH_AUDIO_API_KEY      - (Opcional) API key de Fish Audio para audiolibros
#   LITAGENTS_PASSWORD      - (Opcional) Contrasena de acceso
#   CF_TUNNEL_TOKEN         - (Opcional) Token de Cloudflare Tunnel
# ============================================================

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

APP_NAME="litagents"
APP_DIR="/var/www/$APP_NAME"
CONFIG_DIR="/etc/$APP_NAME"
LOG_DIR="/var/log/$APP_NAME"
APP_PORT="5000"
APP_USER="litagents"
DB_NAME="litagents_db"
DB_USER="litagents"
GITHUB_REPO="https://github.com/atreyu1968/escritorasdgemini.git"

UNATTENDED=false

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
        --fish-key=*)
            FISH_AUDIO_API_KEY="${1#*=}"
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
            echo "  --fish-key=KEY                API key de Fish Audio para audiolibros (opcional)"
            echo "  --password=PASS               Contrasena de acceso (opcional)"
            echo "  --cf-token=TOKEN              Token de Cloudflare Tunnel (opcional)"
            echo "  --help, -h                    Mostrar esta ayuda"
            echo ""
            echo "Ejemplo desatendido:"
            echo "  sudo GEMINI_API_KEY=\"tu-key\" bash install.sh --unattended"
            echo "  sudo GEMINI_API_KEY=\"tu-key\" FISH_AUDIO_API_KEY=\"fish-key\" bash install.sh --unattended"
            echo ""
            echo "  O con argumentos:"
            echo "  sudo bash install.sh --unattended --gemini-key=\"tu-key\" --fish-key=\"fish-key\" --password=\"secreto\""
            exit 0
            ;;
        *)
            print_error "Opción desconocida: $1"
            echo "Usa --help para ver las opciones disponibles"
            exit 1
            ;;
    esac
done

if [ "$EUID" -ne 0 ]; then
    print_error "Este script debe ejecutarse como root"
    echo "Uso: sudo bash install.sh"
    exit 1
fi

PROVIDED_GEMINI_API_KEY="${GEMINI_API_KEY:-}"
PROVIDED_FISH_AUDIO_API_KEY="${FISH_AUDIO_API_KEY:-}"
PROVIDED_LITAGENTS_PASSWORD="${LITAGENTS_PASSWORD:-}"
PROVIDED_CF_TUNNEL_TOKEN="${CF_TUNNEL_TOKEN:-}"

print_header "INSTALADOR DE LITAGENTS (EscritorasdGemini)"
echo "Este script instalará y configurará la aplicación completa."
echo ""

if [ "$UNATTENDED" = true ]; then
    print_status "Modo desatendido activado"
fi

IS_UPDATE=false
if [ -f "$CONFIG_DIR/env" ]; then
    IS_UPDATE=true
    print_warning "Instalación existente detectada. Se realizará una ACTUALIZACIÓN."
    print_status "Las credenciales y configuración se preservarán."
    source "$CONFIG_DIR/env"
    
    [ -n "$PROVIDED_GEMINI_API_KEY" ] && GEMINI_API_KEY="$PROVIDED_GEMINI_API_KEY"
    [ -n "$PROVIDED_FISH_AUDIO_API_KEY" ] && FISH_AUDIO_API_KEY="$PROVIDED_FISH_AUDIO_API_KEY"
    [ -n "$PROVIDED_LITAGENTS_PASSWORD" ] && LITAGENTS_PASSWORD="$PROVIDED_LITAGENTS_PASSWORD"
    [ -n "$PROVIDED_CF_TUNNEL_TOKEN" ] && CF_TUNNEL_TOKEN="$PROVIDED_CF_TUNNEL_TOKEN"
else
    print_status "Instalación nueva detectada."
fi

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
        if [ -z "$GEMINI_API_KEY" ]; then
            print_error "La variable GEMINI_API_KEY es obligatoria en modo desatendido"
            echo "Uso: GEMINI_API_KEY=\"tu-key\" sudo bash install.sh --unattended"
            exit 1
        fi
        print_success "Usando GEMINI_API_KEY desde variable de entorno"
        
        if [ -n "$FISH_AUDIO_API_KEY" ]; then
            print_success "Usando FISH_AUDIO_API_KEY desde variable de entorno"
        else
            print_status "FISH_AUDIO_API_KEY no proporcionada (audiolibros deshabilitados)"
        fi
        
        LITAGENTS_PASSWORD="${LITAGENTS_PASSWORD:-}"
        CF_TOKEN="${CF_TUNNEL_TOKEN:-}"
    else
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
        echo "=== Configuracion de Fish Audio (Audiolibros) ==="
        echo "(Opcional) Para generar audiolibros necesitas una API key de Fish Audio."
        echo "Puedes obtenerla en: https://fish.audio/account/api-key"
        echo "Presiona Enter para omitir (podras configurarla despues)."
        read -p "FISH_AUDIO_API_KEY (opcional): " INPUT_FISH_KEY
        FISH_AUDIO_API_KEY="${INPUT_FISH_KEY:-}"
        
        echo ""
        echo "=== Configuracion de Seguridad ==="
        echo "(Opcional) Configura una contrasena para proteger el acceso a la aplicacion."
        echo "Presiona Enter para omitir (acceso sin contrasena)."
        read -sp "LITAGENTS_PASSWORD (opcional): " INPUT_PASSWORD
        echo ""
        LITAGENTS_PASSWORD="${INPUT_PASSWORD:-}"
    fi
    
    if [ -n "$FISH_AUDIO_API_KEY" ]; then
        print_success "Fish Audio API key configurada (audiolibros habilitados)"
    else
        print_status "Fish Audio omitido (podras configurarlo despues en /etc/litagents/env)"
    fi
    
    if [ -n "$LITAGENTS_PASSWORD" ]; then
        print_success "Contrasena configurada"
    else
        print_status "Acceso sin contrasena (cualquiera podra acceder)"
    fi
    
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

chmod 755 /usr/bin/node 2>/dev/null || true
chmod 755 /usr/bin/npm 2>/dev/null || true

print_success "Node.js $(node -v) instalado"

# ============================================================
# PASO 4: Configurar PostgreSQL
# ============================================================
print_header "PASO 4: Configurando base de datos PostgreSQL"

if [ "$IS_UPDATE" = false ]; then
    print_status "Creando usuario y base de datos..."
    
    if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
        print_warning "Usuario $DB_USER ya existe, actualizando contraseña..."
        sudo -u postgres psql -c "ALTER USER $DB_USER WITH PASSWORD '$DB_PASS';" > /dev/null 2>&1
    else
        sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';" > /dev/null 2>&1
    fi
    
    if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
        print_warning "Base de datos $DB_NAME ya existe"
    else
        sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" > /dev/null 2>&1
    fi
    
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" > /dev/null 2>&1
    sudo -u postgres psql -d "$DB_NAME" -c "GRANT ALL ON SCHEMA public TO $DB_USER;" > /dev/null 2>&1
    sudo -u postgres psql -d "$DB_NAME" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;" > /dev/null 2>&1
    sudo -u postgres psql -d "$DB_NAME" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DB_USER;" > /dev/null 2>&1
    
    PG_HBA=$(sudo -u postgres psql -t -c "SHOW hba_file" | xargs)
    if ! grep -q "local.*$DB_NAME.*$DB_USER.*md5" "$PG_HBA" 2>/dev/null; then
        sed -i "/^# TYPE/a local   $DB_NAME   $DB_USER   md5" "$PG_HBA" 2>/dev/null || \
            echo "local   $DB_NAME   $DB_USER   md5" | sudo tee -a "$PG_HBA" > /dev/null
        systemctl reload postgresql
    fi
    
    print_success "Base de datos configurada"
else
    print_status "Base de datos existente, omitiendo creación"
    
    if [ -n "$DATABASE_URL" ]; then
        DB_NAME_PARSED=$(echo "$DATABASE_URL" | sed -n 's|postgresql://[^/]*/\(.*\)|\1|p')
        DB_USER_PARSED=$(echo "$DATABASE_URL" | sed -n 's|postgresql://\([^:]*\):.*|\1|p')
        sudo -u postgres psql -d "$DB_NAME_PARSED" -c "GRANT ALL ON SCHEMA public TO $DB_USER_PARSED;" > /dev/null 2>&1 || true
        sudo -u postgres psql -d "$DB_NAME_PARSED" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER_PARSED;" > /dev/null 2>&1 || true
        sudo -u postgres psql -d "$DB_NAME_PARSED" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DB_USER_PARSED;" > /dev/null 2>&1 || true
    fi
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
mkdir -p "$APP_DIR/audiobooks"
mkdir -p "$APP_DIR/audiobooks/covers"
chown "$APP_USER:$APP_USER" "$LOG_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR/inbox"
chown -R "$APP_USER:$APP_USER" "$APP_DIR/exports"
chown -R "$APP_USER:$APP_USER" "$APP_DIR/audiobooks"

if [ "$IS_UPDATE" = true ]; then
    print_status "Preservando configuración existente..."
    
    if [ -n "$GEMINI_API_KEY" ] && [ "$GEMINI_API_KEY" != "$(grep -oP 'GEMINI_API_KEY=\K.*' "$CONFIG_DIR/env" 2>/dev/null)" ]; then
        sed -i "s|^GEMINI_API_KEY=.*|GEMINI_API_KEY=$GEMINI_API_KEY|" "$CONFIG_DIR/env"
        print_status "API key de Gemini actualizada"
    fi
    
    if [ -n "$PROVIDED_FISH_AUDIO_API_KEY" ]; then
        if grep -q "^FISH_AUDIO_API_KEY=" "$CONFIG_DIR/env" 2>/dev/null; then
            sed -i "s|^FISH_AUDIO_API_KEY=.*|FISH_AUDIO_API_KEY=$FISH_AUDIO_API_KEY|" "$CONFIG_DIR/env"
        else
            echo "FISH_AUDIO_API_KEY=$FISH_AUDIO_API_KEY" >> "$CONFIG_DIR/env"
        fi
        print_status "API key de Fish Audio actualizada"
    fi
    
    if ! grep -q "FISH_AUDIO_API_KEY" "$CONFIG_DIR/env" 2>/dev/null; then
        echo "FISH_AUDIO_API_KEY=" >> "$CONFIG_DIR/env"
    fi
    
    if ! grep -q "LITAGENTS_INBOX_DIR" "$CONFIG_DIR/env" 2>/dev/null; then
        echo "LITAGENTS_INBOX_DIR=$APP_DIR/inbox" >> "$CONFIG_DIR/env"
        echo "LITAGENTS_EXPORTS_DIR=$APP_DIR/exports" >> "$CONFIG_DIR/env"
    fi
    
    print_success "Configuración preservada"
else
    DATABASE_URL="postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME"
    
    cat > "$CONFIG_DIR/env" << EOF
NODE_ENV=production
PORT=$APP_PORT
DATABASE_URL=$DATABASE_URL
SESSION_SECRET=$SESSION_SECRET
GEMINI_API_KEY=$GEMINI_API_KEY
FISH_AUDIO_API_KEY=$FISH_AUDIO_API_KEY
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
    
    mkdir -p "$APP_DIR/inbox"
    mkdir -p "$APP_DIR/inbox/processed"
    mkdir -p "$APP_DIR/exports"
    mkdir -p "$APP_DIR/audiobooks"
    mkdir -p "$APP_DIR/audiobooks/covers"
fi

chown -R "$APP_USER:$APP_USER" "$APP_DIR"
print_success "Código descargado en $APP_DIR"

# ============================================================
# PASO 8: Instalar dependencias y compilar
# ============================================================
print_header "PASO 8: Instalando dependencias de Node.js"

cd "$APP_DIR"

set -a
source "$CONFIG_DIR/env"
set +a

print_status "Ejecutando npm install..."
sudo -u "$APP_USER" npm install --legacy-peer-deps 2>&1 | tail -5

print_status "Compilando aplicación..."
sudo -u "$APP_USER" npm run build 2>&1 | tail -5

print_status "Ejecutando migraciones de schema (drizzle-kit push)..."
yes | sudo -u "$APP_USER" --preserve-env=DATABASE_URL,NODE_ENV npx drizzle-kit push 2>&1 | tail -5

print_status "Verificando que las tablas se crearon correctamente..."
TABLE_COUNT=$(sudo -u postgres psql -d "$DB_NAME" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null || echo "0")
if [ "$TABLE_COUNT" -gt 0 ] 2>/dev/null; then
    print_success "Base de datos inicializada con $TABLE_COUNT tablas"
else
    print_warning "No se detectaron tablas. Reintentando db:push..."
    yes | sudo -u "$APP_USER" --preserve-env=DATABASE_URL,NODE_ENV npx drizzle-kit push 2>&1 | tail -5
    TABLE_COUNT=$(sudo -u postgres psql -d "$DB_NAME" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null || echo "0")
    if [ "$TABLE_COUNT" -gt 0 ] 2>/dev/null; then
        print_success "Base de datos inicializada con $TABLE_COUNT tablas (segundo intento)"
    else
        print_error "Las tablas no se crearon. Revisa la conexión a la base de datos."
    fi
fi

print_status "Aplicando migraciones SQL adicionales..."
DB_USER_PARSED=$(echo "$DATABASE_URL" | sed -n 's|postgresql://\([^:]*\):.*|\1|p')
DB_PASS_PARSED=$(echo "$DATABASE_URL" | sed -n 's|postgresql://[^:]*:\([^@]*\)@.*|\1|p')
DB_HOST_PARSED=$(echo "$DATABASE_URL" | sed -n 's|postgresql://[^@]*@\([^:]*\):.*|\1|p')
DB_PORT_PARSED=$(echo "$DATABASE_URL" | sed -n 's|postgresql://[^:]*:[^@]*@[^:]*:\([^/]*\)/.*|\1|p')
DB_NAME_PARSED=$(echo "$DATABASE_URL" | sed -n 's|postgresql://[^/]*/\(.*\)|\1|p')
for migration in "$APP_DIR"/migrations/*.sql; do
    if [ -f "$migration" ]; then
        print_status "  $(basename "$migration")..."
        sudo -u "$APP_USER" PGPASSWORD="$DB_PASS_PARSED" psql -U "$DB_USER_PARSED" -h "$DB_HOST_PARSED" -p "$DB_PORT_PARSED" "$DB_NAME_PARSED" -f "$migration" 2>/dev/null || true
    fi
done

print_success "Aplicación compilada"

# ============================================================
# PASO 9: Configurar servicio systemd
# ============================================================
print_header "PASO 9: Configurando servicio systemd"

INBOX_DIR="${LITAGENTS_INBOX_DIR:-$APP_DIR/inbox}"
EXPORTS_DIR="${LITAGENTS_EXPORTS_DIR:-$APP_DIR/exports}"
AUDIOBOOKS_DIR="$APP_DIR/audiobooks"

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

LimitNOFILE=65535
MemoryMax=2G

NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$APP_DIR $LOG_DIR $INBOX_DIR $EXPORTS_DIR $AUDIOBOOKS_DIR /tmp

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$APP_NAME" > /dev/null 2>&1
systemctl restart "$APP_NAME"

sleep 5

if systemctl is-active --quiet "$APP_NAME"; then
    print_success "Servicio $APP_NAME iniciado correctamente"
    
    print_status "Verificando que la aplicación responde..."
    for i in 1 2 3 4 5; do
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$APP_PORT/api/auth/status" 2>/dev/null || echo "000")
        if [ "$HTTP_CODE" = "200" ]; then
            print_success "Aplicación respondiendo correctamente en puerto $APP_PORT"
            break
        fi
        if [ "$i" -eq 5 ]; then
            print_warning "La aplicación está corriendo pero no responde aún. Revisa los logs: cat $LOG_DIR/app.log"
        fi
        sleep 2
    done
else
    print_error "Error al iniciar el servicio"
    echo ""
    echo "=== Últimos logs de la aplicación ==="
    cat "$LOG_DIR/error.log" 2>/dev/null | tail -20 || journalctl -u "$APP_NAME" -n 20 --no-pager
fi

# ============================================================
# PASO 10: Configurar Nginx
# ============================================================
print_header "PASO 10: Configurando Nginx"

cat > "/etc/nginx/sites-available/$APP_NAME" << 'NGINXEOF'
server {
    listen 80;
    server_name _;
    
    client_max_body_size 500M;
    
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
        
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
    }

    location ~ ^/api/projects/\d+/(generate|reedit|translate)-stream$ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
        proxy_read_timeout 86400s;
    }

    location /sse/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
        proxy_read_timeout 86400s;
    }
}
NGINXEOF

ln -sf "/etc/nginx/sites-available/$APP_NAME" /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

if nginx -t > /dev/null 2>&1; then
    systemctl restart nginx
    print_success "Nginx configurado correctamente"
else
    print_error "Error en la configuración de Nginx"
    nginx -t
fi

# ============================================================
# PASO 11: Configurar logrotate
# ============================================================
print_header "PASO 11: Configurando rotación de logs"

cat > "/etc/logrotate.d/$APP_NAME" << EOF
$LOG_DIR/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 $APP_USER $APP_USER
    sharedscripts
    postrotate
        systemctl reload $APP_NAME > /dev/null 2>&1 || true
    endscript
}
EOF

print_success "Logrotate configurado (retención: 14 días)"

# ============================================================
# PASO 12: Configurar firewall (UFW)
# ============================================================
print_header "PASO 12: Configurando firewall"

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
# PASO 13: Cloudflare Tunnel (opcional)
# ============================================================
print_header "PASO 13: Cloudflare Tunnel (opcional)"

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
    
    curl -L -o /tmp/cloudflared.deb \
        https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb 2>/dev/null
    dpkg -i /tmp/cloudflared.deb > /dev/null 2>&1
    rm -f /tmp/cloudflared.deb
    
    systemctl stop cloudflared 2>/dev/null || true
    
    cloudflared service install "$CF_TOKEN" 2>/dev/null || true
    systemctl enable cloudflared > /dev/null 2>&1
    systemctl start cloudflared
    
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
# PASO 14: Crear scripts de utilidad
# ============================================================
print_header "PASO 14: Creando scripts de utilidad"

cat > "$APP_DIR/update.sh" << 'UPDATEEOF'
#!/bin/bash
set -e

APP_DIR="/var/www/litagents"
APP_USER="litagents"
CONFIG_FILE="/etc/litagents/env"
LOG_DIR="/var/log/litagents"

echo "=== Actualizando LitAgents ==="

cd "$APP_DIR"

set -a
source "$CONFIG_FILE"
set +a

if [ -z "$FISH_AUDIO_API_KEY" ]; then
    echo ""
    echo "=== Configuracion de Fish Audio (Audiolibros) ==="
    echo "La funcion de audiolibros requiere una API key de Fish Audio."
    echo "Puedes obtenerla en: https://fish.audio/account/api-key"
    echo "Presiona Enter para omitir (podras configurarla despues en $CONFIG_FILE)."
    read -p "FISH_AUDIO_API_KEY (opcional): " INPUT_FISH_KEY
    if [ -n "$INPUT_FISH_KEY" ]; then
        if grep -q "^FISH_AUDIO_API_KEY=" "$CONFIG_FILE" 2>/dev/null; then
            sed -i "s|^FISH_AUDIO_API_KEY=.*|FISH_AUDIO_API_KEY=$INPUT_FISH_KEY|" "$CONFIG_FILE"
        else
            echo "FISH_AUDIO_API_KEY=$INPUT_FISH_KEY" >> "$CONFIG_FILE"
        fi
        export FISH_AUDIO_API_KEY="$INPUT_FISH_KEY"
        echo "[OK] Fish Audio API key configurada"
    else
        if ! grep -q "^FISH_AUDIO_API_KEY=" "$CONFIG_FILE" 2>/dev/null; then
            echo "FISH_AUDIO_API_KEY=" >> "$CONFIG_FILE"
        fi
        echo "[INFO] Fish Audio omitido"
    fi
    echo ""
else
    echo "[OK] Fish Audio API key ya configurada"
fi

mkdir -p "$APP_DIR/audiobooks/covers"
chown -R "$APP_USER:$APP_USER" "$APP_DIR/audiobooks"

echo "1. Obteniendo últimos cambios..."
git fetch --all
git reset --hard origin/main
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "2. Instalando dependencias..."
sudo -u "$APP_USER" npm install --legacy-peer-deps 2>&1 | tail -5

echo "3. Compilando aplicación..."
sudo -u "$APP_USER" npm run build 2>&1 | tail -5

echo "4. Ejecutando migraciones de schema (drizzle-kit push)..."
yes | sudo -u "$APP_USER" --preserve-env=DATABASE_URL,NODE_ENV npx drizzle-kit push 2>&1 | tail -5

echo "5. Aplicando migraciones SQL adicionales..."
for migration in "$APP_DIR"/migrations/*.sql; do
    if [ -f "$migration" ]; then
        echo "   Aplicando $(basename "$migration")..."
        sudo -u "$APP_USER" PGPASSWORD="$(echo "$DATABASE_URL" | sed -n 's|postgresql://[^:]*:\([^@]*\)@.*|\1|p')" \
            psql -U "$(echo "$DATABASE_URL" | sed -n 's|postgresql://\([^:]*\):.*|\1|p')" \
            -h "$(echo "$DATABASE_URL" | sed -n 's|postgresql://[^@]*@\([^:]*\):.*|\1|p')" \
            -p "$(echo "$DATABASE_URL" | sed -n 's|postgresql://[^:]*:[^@]*@[^:]*:\([^/]*\)/.*|\1|p')" \
            "$(echo "$DATABASE_URL" | sed -n 's|postgresql://[^/]*/\(.*\)|\1|p')" \
            -f "$migration" 2>/dev/null || true
    fi
done

echo "6. Reiniciando servicio..."
sudo systemctl restart litagents

sleep 5

if systemctl is-active --quiet litagents; then
    echo ""
    echo "=== Verificando que la aplicación responde ==="
    for i in 1 2 3 4 5; do
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:5000/api/auth/status" 2>/dev/null || echo "000")
        if [ "$HTTP_CODE" = "200" ]; then
            echo "Aplicación respondiendo correctamente"
            break
        fi
        [ "$i" -eq 5 ] && echo "AVISO: La aplicación no responde aún. Revisa: cat $LOG_DIR/app.log"
        sleep 2
    done
    echo ""
    echo "=== Actualización completada correctamente ==="
    systemctl status litagents --no-pager -l
else
    echo "=== ERROR: El servicio no arrancó ==="
    echo ""
    echo "=== Logs de error ==="
    cat "$LOG_DIR/error.log" 2>/dev/null | tail -30 || journalctl -u litagents -n 30 --no-pager
    exit 1
fi
UPDATEEOF

chmod +x "$APP_DIR/update.sh"
chown "$APP_USER:$APP_USER" "$APP_DIR/update.sh"

cat > "$APP_DIR/backup.sh" << 'EOF'
#!/bin/bash
set -e

BACKUP_DIR="/var/backups/litagents"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

echo "Creando backup de base de datos..."
source /etc/litagents/env

DB_USER=$(echo "$DATABASE_URL" | sed -n 's|postgresql://\([^:]*\):.*|\1|p')
DB_PASS=$(echo "$DATABASE_URL" | sed -n 's|postgresql://[^:]*:\([^@]*\)@.*|\1|p')
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|postgresql://[^@]*@\([^:]*\):.*|\1|p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|postgresql://[^:]*:[^@]*@[^:]*:\([^/]*\)/.*|\1|p')
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's|postgresql://[^/]*/\(.*\)|\1|p')

PGPASSWORD="$DB_PASS" pg_dump -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" "$DB_NAME" > "$BACKUP_DIR/db_$DATE.sql"

echo "Backup guardado en: $BACKUP_DIR/db_$DATE.sql"

ls -t "$BACKUP_DIR"/db_*.sql | tail -n +8 | xargs -r rm

echo "Backups disponibles:"
ls -lh "$BACKUP_DIR"
EOF

chmod +x "$APP_DIR/backup.sh"

cat > "$APP_DIR/logs.sh" << EOF
#!/bin/bash
echo "=== Últimos logs de la aplicación ==="
echo ""
echo "--- app.log (últimas 50 líneas) ---"
tail -50 $LOG_DIR/app.log 2>/dev/null || echo "Sin logs de aplicación"
echo ""
echo "--- error.log (últimas 30 líneas) ---"
tail -30 $LOG_DIR/error.log 2>/dev/null || echo "Sin errores"
echo ""
echo "--- Estado del servicio ---"
systemctl status $APP_NAME --no-pager -l 2>/dev/null || true
EOF

chmod +x "$APP_DIR/logs.sh"

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
echo "  Logs app:      sudo $APP_DIR/logs.sh"
echo "  Logs tiempo real: tail -f $LOG_DIR/app.log"
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
if [ -n "$LITAGENTS_PASSWORD" ]; then
echo -e "${YELLOW}Acceso protegido con contrasena.${NC}"
else
echo -e "${YELLOW}Sin contrasena configurada. Cualquiera con acceso a la URL puede usar la app.${NC}"
fi
echo ""
if [ -n "$CF_TOKEN" ]; then
echo -e "${GREEN}Cookies HTTPS activadas (Cloudflare Tunnel detectado).${NC}"
else
echo -e "${YELLOW}Cookies HTTP. Si usas HTTPS, edita $CONFIG_DIR/env y cambia SECURE_COOKIES=true${NC}"
fi
echo ""
