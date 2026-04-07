#!/bin/bash
set -eo pipefail

APP_DIR="/var/www/litagents"
APP_USER="litagents"
CONFIG_FILE="/etc/litagents/env"
LOG_DIR="/var/log/litagents"

if [ "$EUID" -ne 0 ]; then
    echo "[ERROR] Este script debe ejecutarse como root: sudo bash update.sh"
    exit 1
fi

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
mkdir -p "$APP_DIR/inbox/processed"
mkdir -p "$APP_DIR/exports"

git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true

echo "1. Obteniendo ultimos cambios..."
FETCH_OK=false
for attempt in 1 2 3; do
    if git fetch --all 2>&1; then
        FETCH_OK=true
        break
    fi
    echo "[AVISO] Intento $attempt fallido. Reintentando en 5 segundos..."
    sleep 5
done

if [ "$FETCH_OK" = true ]; then
    git reset --hard origin/main
else
    echo "[AVISO] No se pudo conectar a GitHub. Continuando con el codigo actual."
fi

echo "   Reparando permisos..."
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

APP_USER_HOME=$(eval echo "~$APP_USER")
mkdir -p "$APP_USER_HOME/.npm"
chown -R "$APP_USER:$APP_USER" "$APP_USER_HOME/.npm"

echo "2. Instalando dependencias..."
NPM_LOG=$(mktemp)
set +e
sudo -u "$APP_USER" -H \
    env "HOME=$APP_USER_HOME" "PATH=$PATH" \
    npm install --legacy-peer-deps > "$NPM_LOG" 2>&1
NPM_EXIT=$?
set -e
tail -10 "$NPM_LOG"
if [ "$NPM_EXIT" -ne 0 ]; then
    echo "[AVISO] npm install fallo (exit code $NPM_EXIT). Reintentando..."
    set +e
    sudo -u "$APP_USER" -H \
        env "HOME=$APP_USER_HOME" "PATH=$PATH" \
        npm install --legacy-peer-deps > "$NPM_LOG" 2>&1
    NPM_EXIT=$?
    set -e
    tail -10 "$NPM_LOG"
    if [ "$NPM_EXIT" -ne 0 ]; then
        echo "[ERROR] npm install fallo dos veces"
        cat "$NPM_LOG"
        rm -f "$NPM_LOG"
        exit 1
    fi
fi
rm -f "$NPM_LOG"

echo "3. Ejecutando migraciones de schema (pre-build)..."
CLEAN_DB_URL=$(echo "$DATABASE_URL" | sed 's|^postgres://|postgresql://|')
DB_PASS_M=$(echo "$CLEAN_DB_URL" | sed -n 's|postgresql://[^:]*:\([^@]*\)@.*|\1|p')
DB_USER_M=$(echo "$CLEAN_DB_URL" | sed -n 's|postgresql://\([^:]*\):.*|\1|p')
DB_HOST_M=$(echo "$CLEAN_DB_URL" | sed -n 's|postgresql://[^@]*@\([^:]*\):.*|\1|p')
DB_PORT_M=$(echo "$CLEAN_DB_URL" | sed -n 's|postgresql://[^:]*:[^@]*@[^:]*:\([^/]*\)/.*|\1|p')
DB_NAME_M=$(echo "$CLEAN_DB_URL" | sed -n 's|postgresql://[^/]*/\([^?]*\).*|\1|p')

PGPASSWORD="$DB_PASS_M" psql -U "$DB_USER_M" -h "$DB_HOST_M" -p "$DB_PORT_M" "$DB_NAME_M" -c "
CREATE TABLE IF NOT EXISTS pseudonyms (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    bio TEXT,
    default_genre TEXT,
    default_tone TEXT,
    email TEXT,
    goodreads_url TEXT,
    website_url TEXT,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS style_guides (
    id SERIAL PRIMARY KEY,
    pseudonym_id INTEGER NOT NULL REFERENCES pseudonyms(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS cover_prompts (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    series_id INTEGER REFERENCES series(id) ON DELETE SET NULL,
    pseudonym_id INTEGER REFERENCES pseudonyms(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    prompt TEXT NOT NULL,
    negative_prompt TEXT,
    style TEXT NOT NULL DEFAULT 'realistic',
    color_palette TEXT,
    mood TEXT,
    typography TEXT,
    composition TEXT,
    series_design_system JSONB,
    cover_specs JSONB DEFAULT '{\"width\":1600,\"height\":2560,\"dpi\":300,\"format\":\"JPEG\",\"colorMode\":\"RGB\",\"ratio\":\"1.6:1\"}',
    status TEXT NOT NULL DEFAULT 'draft',
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS kdp_metadata (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    reedit_project_id INTEGER REFERENCES reedit_projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    subtitle TEXT,
    description TEXT,
    keywords TEXT[],
    bisac_categories TEXT[],
    series_name TEXT,
    series_number INTEGER,
    series_description TEXT,
    language TEXT NOT NULL DEFAULT 'es',
    target_marketplace TEXT NOT NULL DEFAULT 'amazon.es',
    ai_disclosure TEXT NOT NULL DEFAULT 'ai-assisted',
    content_warnings TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    session_token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL
);



CREATE TABLE IF NOT EXISTS book_catalog (
    id SERIAL PRIMARY KEY,
    pseudonym_id INTEGER REFERENCES pseudonyms(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    author_name TEXT NOT NULL,
    amazon_url TEXT,
    goodreads_url TEXT,
    synopsis TEXT,
    genre TEXT,
    asin TEXT,
    is_kindle_unlimited BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS project_back_matter (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    reedit_project_id INTEGER REFERENCES reedit_projects(id) ON DELETE CASCADE,
    enable_review_request BOOLEAN NOT NULL DEFAULT true,
    review_request_language TEXT NOT NULL DEFAULT 'es',
    review_author_name TEXT,
    review_amazon_url TEXT,
    review_goodreads_url TEXT,
    enable_also_by BOOLEAN NOT NULL DEFAULT true,
    also_by_title TEXT,
    selected_book_ids JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS name_blacklist (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'nombre',
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_name_blacklist_unique ON name_blacklist(LOWER(name), type);
" 2>/dev/null && echo "[OK] Tablas verificadas" || echo "[AVISO] Algunas tablas ya existian"

echo "4. Aplicando migraciones SQL adicionales..."
for migration in "$APP_DIR"/migrations/*.sql; do
    if [ -f "$migration" ]; then
        echo "   Aplicando $(basename "$migration")..."
        PGPASSWORD="$DB_PASS_M" \
            psql -U "$DB_USER_M" \
            -h "$DB_HOST_M" \
            -p "$DB_PORT_M" \
            "$DB_NAME_M" \
            -f "$migration" 2>/dev/null || true
    fi
done

echo "5. Compilando aplicacion (frontend + backend)..."
BUILD_LOG=$(mktemp)
set +e
sudo -u "$APP_USER" -H \
    env "HOME=$APP_USER_HOME" "PATH=$PATH" \
    "DATABASE_URL=$DATABASE_URL" \
    "NODE_ENV=production" \
    npm run build > "$BUILD_LOG" 2>&1
BUILD_EXIT=$?
set -e

tail -20 "$BUILD_LOG"

if [ "$BUILD_EXIT" -ne 0 ]; then
    echo "[ERROR] La compilacion fallo (exit code $BUILD_EXIT). Log completo:"
    cat "$BUILD_LOG"
    rm -f "$BUILD_LOG"
    exit 1
fi
rm -f "$BUILD_LOG"

echo "6. Reiniciando servicio..."
NODE_BIN=$(which node)
INBOX_DIR="${LITAGENTS_INBOX_DIR:-$APP_DIR/inbox}"
EXPORTS_DIR="${LITAGENTS_EXPORTS_DIR:-$APP_DIR/exports}"
AUDIOBOOKS_DIR="$APP_DIR/audiobooks"

cat > "/etc/systemd/system/litagents.service" << EOF
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
EnvironmentFile=$CONFIG_FILE
ExecStart=$NODE_BIN $APP_DIR/dist/index.cjs
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
sudo systemctl restart litagents

sleep 5

if systemctl is-active --quiet litagents; then
    echo ""
    echo "=== Verificando que la aplicacion responde ==="
    for i in 1 2 3 4 5 6; do
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:5000/api/auth/status" 2>/dev/null || echo "000")
        if [ "$HTTP_CODE" = "200" ]; then
            echo "Aplicacion respondiendo correctamente"
            break
        fi
        [ "$i" -eq 6 ] && echo "AVISO: La aplicacion no responde aun. Revisa: cat $LOG_DIR/app.log"
        sleep 3
    done
    echo ""
    echo "=== Actualizacion completada correctamente ==="
    systemctl status litagents --no-pager -l
else
    echo "=== ERROR: El servicio no arranco ==="
    echo ""
    echo "=== Logs de error ==="
    cat "$LOG_DIR/error.log" 2>/dev/null | tail -30 || journalctl -u litagents -n 30 --no-pager
    exit 1
fi
