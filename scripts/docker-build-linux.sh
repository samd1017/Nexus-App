#!/usr/bin/env bash
# Build Nexus Tauri desktop for Linux inside Docker (no host sudo for apt deps).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE_NAME="${NEXUS_BUILD_IMAGE:-nexus-tauri-linux-builder:0.1}"
OUT_DIR="${ROOT}/src-tauri/target/release/bundle"
HOST_OUT="${HOME}/Applications/Nexus"

echo "[nexus-build] root=$ROOT"
echo "[nexus-build] ensuring builder image..."

docker build -t "$IMAGE_NAME" -f - "$ROOT" <<'Dockerfile'
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    wget \
    file \
    ca-certificates \
    pkg-config \
    libssl-dev \
    libgtk-3-dev \
    libwebkit2gtk-4.1-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    patchelf \
    libxdo-dev \
    xdg-utils \
    git \
    python3 \
  && rm -rf /var/lib/apt/lists/*

# Node 22
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/* \
  && node -v && npm -v

# Rust stable
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
ENV PATH="/root/.cargo/bin:${PATH}"
RUN rustc -V && cargo -V

WORKDIR /app
Dockerfile

mkdir -p "$ROOT/.cargo-docker" "$ROOT/src-tauri/target" "$HOST_OUT"

echo "[nexus-build] running tauri build (deb + appimage)..."
# Keep image Rust toolchain (RUSTUP_HOME/CARGO_HOME under /root).
# Cache only registry/git; never override CARGO_HOME with an empty host dir.
docker run --rm \
  --user "0:0" \
  -e HOME=/root \
  -e RUSTUP_HOME=/root/.rustup \
  -e CARGO_HOME=/root/.cargo \
  -e PATH="/root/.cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  -e npm_config_cache=/npm-cache \
  -v "$ROOT:/app" \
  -v nexus-cargo-registry:/root/.cargo/registry \
  -v nexus-cargo-git:/root/.cargo/git \
  -v nexus-npm-cache:/npm-cache \
  -w /app \
  "$IMAGE_NAME" \
  bash -lc '
    set -euo pipefail
    rustup default stable
    if [ ! -d node_modules ] || [ ! -x node_modules/@tauri-apps/cli/tauri.js ]; then
      npm ci || npm install
    fi
    npm run build:desktop
    npx tauri build --bundles deb,appimage
    echo "[nexus-build] bundle tree:"
    find src-tauri/target/release/bundle -maxdepth 3 -type f \( -name "*.AppImage" -o -name "*.deb" -o -name nexus \) 2>/dev/null
  '
# Restore host ownership of docker-written artifacts
docker run --rm -v "$ROOT:/app" -v "${HOME}/Applications:/apps" ubuntu:24.04 \
  bash -lc "chown -R $(id -u):$(id -g) /app/src-tauri/target /app/dist-desktop /apps 2>/dev/null || true"

echo "[nexus-build] copying installers to $HOST_OUT"
mkdir -p "$HOST_OUT"
# AppImage
mapfile -t APPIMAGES < <(find "$ROOT/src-tauri/target/release/bundle/appimage" -name "*.AppImage" 2>/dev/null || true)
mapfile -t DEBS < <(find "$ROOT/src-tauri/target/release/bundle/deb" -name "*.deb" 2>/dev/null || true)
BIN=""
if [ -x "$ROOT/src-tauri/target/release/nexus" ]; then
  BIN="$ROOT/src-tauri/target/release/nexus"
fi

for f in "${APPIMAGES[@]:-}"; do
  [ -n "$f" ] || continue
  cp -f "$f" "$HOST_OUT/"
  chmod +x "$HOST_OUT/$(basename "$f")"
  echo "  AppImage -> $HOST_OUT/$(basename "$f")"
done
for f in "${DEBS[@]:-}"; do
  [ -n "$f" ] || continue
  cp -f "$f" "$HOST_OUT/"
  echo "  deb -> $HOST_OUT/$(basename "$f")"
done
if [ -n "$BIN" ]; then
  cp -f "$BIN" "$HOST_OUT/nexus"
  chmod +x "$HOST_OUT/nexus"
  echo "  binary -> $HOST_OUT/nexus"
fi

# Desktop entry for user session (no root)
APPIMAGE_PATH="$(ls -1 "$HOST_OUT"/*.AppImage 2>/dev/null | head -1 || true)"
if [ -n "$APPIMAGE_PATH" ]; then
  mkdir -p "$HOME/.local/share/applications" "$HOME/.local/bin"
  ln -sfn "$APPIMAGE_PATH" "$HOME/.local/bin/nexus"
  cat > "$HOME/.local/share/applications/nexus.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Nexus
Comment=Notes for Humans and Agents
Exec=$APPIMAGE_PATH
Icon=nexus
Terminal=false
Categories=Office;TextEditor;
StartupWMClass=Nexus
EOF
  echo "[nexus-build] desktop entry + ~/.local/bin/nexus symlink ready"
fi

echo "[nexus-build] DONE"
ls -lah "$HOST_OUT"
