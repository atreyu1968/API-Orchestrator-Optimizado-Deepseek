#!/bin/bash
set -e

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

echo "2. Instalando dependencias..."
sudo -u "$APP_USER" npm install --legacy-peer-deps 2>&1 | tail -5

echo "3. Compilando aplicacion..."
sudo -u "$APP_USER" npm run build 2>&1 | tail -5

echo "4. Ejecutando migraciones de schema..."
DB_PASS_M=$(echo "$DATABASE_URL" | sed -n 's|postgresql://[^:]*:\([^@]*\)@.*|\1|p')
DB_USER_M=$(echo "$DATABASE_URL" | sed -n 's|postgresql://\([^:]*\):.*|\1|p')
DB_HOST_M=$(echo "$DATABASE_URL" | sed -n 's|postgresql://[^@]*@\([^:]*\):.*|\1|p')
DB_PORT_M=$(echo "$DATABASE_URL" | sed -n 's|postgresql://[^:]*:[^@]*@[^:]*:\([^/]*\)/.*|\1|p')
DB_NAME_M=$(echo "$DATABASE_URL" | sed -n 's|postgresql://[^/]*/\([^?]*\).*|\1|p')

sudo -u "$APP_USER" PGPASSWORD="$DB_PASS_M" psql -U "$DB_USER_M" -h "$DB_HOST_M" -p "$DB_PORT_M" "$DB_NAME_M" -c "
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

ALTER TABLE pseudonyms ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE pseudonyms ADD COLUMN IF NOT EXISTS goodreads_url TEXT;
" 2>/dev/null && echo "[OK] Tablas verificadas" || echo "[AVISO] Algunas tablas ya existian"

echo "5. Aplicando migraciones SQL adicionales..."
DB_PASS_PARSED=$(echo "$DATABASE_URL" | sed -n 's|postgresql://[^:]*:\([^@]*\)@.*|\1|p')
DB_USER_PARSED=$(echo "$DATABASE_URL" | sed -n 's|postgresql://\([^:]*\):.*|\1|p')
DB_HOST_PARSED=$(echo "$DATABASE_URL" | sed -n 's|postgresql://[^@]*@\([^:]*\):.*|\1|p')
DB_PORT_PARSED=$(echo "$DATABASE_URL" | sed -n 's|postgresql://[^:]*:[^@]*@[^:]*:\([^/]*\)/.*|\1|p')
DB_NAME_PARSED=$(echo "$DATABASE_URL" | sed -n 's|postgresql://[^/]*/\(.*\)|\1|p')
for migration in "$APP_DIR"/migrations/*.sql; do
    if [ -f "$migration" ]; then
        echo "   Aplicando $(basename "$migration")..."
        sudo -u "$APP_USER" PGPASSWORD="$DB_PASS_PARSED" \
            psql -U "$DB_USER_PARSED" \
            -h "$DB_HOST_PARSED" \
            -p "$DB_PORT_PARSED" \
            "$DB_NAME_PARSED" \
            -f "$migration" 2>/dev/null || true
    fi
done

echo "6. Reiniciando servicio..."
systemctl daemon-reload
sudo systemctl restart litagents

sleep 5

if systemctl is-active --quiet litagents; then
    echo ""
    echo "=== Verificando que la aplicacion responde ==="
    for i in 1 2 3 4 5; do
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:5000/api/auth/status" 2>/dev/null || echo "000")
        if [ "$HTTP_CODE" = "200" ]; then
            echo "Aplicacion respondiendo correctamente"
            break
        fi
        [ "$i" -eq 5 ] && echo "AVISO: La aplicacion no responde aun. Revisa: cat $LOG_DIR/app.log"
        sleep 2
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
