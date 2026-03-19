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

git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true

echo "1. Obteniendo últimos cambios..."
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
    chown -R "$APP_USER:$APP_USER" "$APP_DIR"
else
    echo "[AVISO] No se pudo conectar a GitHub. Continuando con el código actual."
fi

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
