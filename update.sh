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

echo "3. Sincronizando schema de base de datos..."
CLEAN_DB_URL_PUSH=$(echo "$DATABASE_URL" | sed 's|^postgres://|postgresql://|')
DB_USER_PUSH=$(echo "$CLEAN_DB_URL_PUSH" | sed -n 's|postgresql://\([^:]*\):.*|\1|p')
DB_NAME_PUSH=$(echo "$CLEAN_DB_URL_PUSH" | sed -n 's|postgresql://[^/]*/\([^?]*\).*|\1|p')
SUPERUSER_DB_URL="postgresql://postgres@localhost:5432/$DB_NAME_PUSH"

# Pre-crear tablas/columnas que drizzle-kit detectaría como ambiguas
# (rename vs create) para evitar el prompt interactivo que cuelga el push
# en SSH no-TTY. Si ya existen, los IF NOT EXISTS no hacen nada.
echo "   Pre-creando tablas/columnas para evitar prompts de drizzle..."
sudo -u postgres psql -d "$DB_NAME_PUSH" <<'SQL' > /dev/null 2>&1 || true
CREATE TABLE IF NOT EXISTS publishers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  logo_data_url TEXT,
  website_url TEXT,
  copyright_line TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS holistic_gate_verdict JSONB;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS auto_beta_loop BOOLEAN DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS auto_beta_loop_max_iterations INTEGER DEFAULT 3;
ALTER TABLE reedit_projects ADD COLUMN IF NOT EXISTS auto_beta_loop_on_translations BOOLEAN DEFAULT false;
ALTER TABLE reedit_projects ADD COLUMN IF NOT EXISTS auto_beta_loop_on_translations_max_iterations INTEGER DEFAULT 2;
SQL

echo "   Ejecutando db:push como superusuario postgres..."
set +e
sudo -u postgres \
    env "HOME=/var/lib/postgresql" "PATH=$PATH" \
    "DATABASE_URL=$SUPERUSER_DB_URL" "NODE_ENV=production" \
    npx drizzle-kit push --force 2>&1 | tail -20
PUSH_EXIT=$?
set -e
if [ "$PUSH_EXIT" -eq 0 ]; then
    echo "[OK] Schema sincronizado"
    echo "   Otorgando propiedad de tablas a $DB_USER_PUSH..."
    sudo -u postgres psql -d "$DB_NAME_PUSH" -c "
    DO \$\$
    DECLARE r RECORD;
    BEGIN
      FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE 'ALTER TABLE public.' || quote_ident(r.tablename) || ' OWNER TO $DB_USER_PUSH';
      END LOOP;
      FOR r IN SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public' LOOP
        EXECUTE 'ALTER SEQUENCE public.' || quote_ident(r.sequence_name) || ' OWNER TO $DB_USER_PUSH';
      END LOOP;
    END\$\$;" > /dev/null 2>&1 || true
    sudo -u postgres psql -d "$DB_NAME_PUSH" -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DB_USER_PUSH;" > /dev/null 2>&1 || true
    sudo -u postgres psql -d "$DB_NAME_PUSH" -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DB_USER_PUSH;" > /dev/null 2>&1 || true
else
    echo "[AVISO] db:push como postgres fallo. Reintentando como $APP_USER..."
    set +e
    sudo -u "$APP_USER" -H \
        env "HOME=$APP_USER_HOME" "PATH=$PATH" \
        "DATABASE_URL=$DATABASE_URL" "NODE_ENV=production" \
        npx drizzle-kit push --force 2>&1 | tail -20
    set -e
fi

echo "4. Aplicando migraciones SQL adicionales..."
CLEAN_DB_URL=$(echo "$DATABASE_URL" | sed 's|^postgres://|postgresql://|')
DB_PASS_M=$(echo "$CLEAN_DB_URL" | sed -n 's|postgresql://[^:]*:\([^@]*\)@.*|\1|p')
DB_USER_M=$(echo "$CLEAN_DB_URL" | sed -n 's|postgresql://\([^:]*\):.*|\1|p')
DB_HOST_M=$(echo "$CLEAN_DB_URL" | sed -n 's|postgresql://[^@]*@\([^:]*\):.*|\1|p')
DB_PORT_M=$(echo "$CLEAN_DB_URL" | sed -n 's|postgresql://[^:]*:[^@]*@[^:]*:\([^/]*\)/.*|\1|p')
DB_NAME_M=$(echo "$CLEAN_DB_URL" | sed -n 's|postgresql://[^/]*/\([^?]*\).*|\1|p')

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
# SKIP_DB_PUSH=1 porque el paso 3 ya sincronizó el schema. Si dejamos que
# script/build.ts vuelva a hacer drizzle-kit push, se topa con el mismo
# prompt interactivo de detección de renames y cuelga (ETIMEDOUT).
BUILD_LOG=$(mktemp)
set +e
sudo -u "$APP_USER" -H \
    env "HOME=$APP_USER_HOME" "PATH=$PATH" \
    "DATABASE_URL=$DATABASE_URL" \
    "NODE_ENV=production" \
    "SKIP_DB_PUSH=1" \
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
Documentation=https://github.com/atreyu1968/API-Orchestrator-Optimizado-Deepseek
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
