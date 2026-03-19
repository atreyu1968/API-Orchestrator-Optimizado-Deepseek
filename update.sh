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

echo "4. Ejecutando migraciones de schema (drizzle-kit push)..."
sudo -u "$APP_USER" --preserve-env=DATABASE_URL,NODE_ENV npx drizzle-kit push --force 2>&1 | tail -10
if [ $? -ne 0 ]; then
    echo "[AVISO] drizzle-kit push --force no disponible, intentando modo interactivo..."
    yes | sudo -u "$APP_USER" --preserve-env=DATABASE_URL,NODE_ENV npx drizzle-kit push 2>&1 | tail -10
fi

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
