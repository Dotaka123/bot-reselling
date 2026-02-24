# ─────────────────────────────────────────────
# Stage 1 : Builder (install des dépendances)
# ─────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copie uniquement les fichiers de dépendances d'abord (cache Docker optimal)
COPY package*.json ./

# Install SANS les devDependencies
RUN npm ci --omit=dev

# ─────────────────────────────────────────────
# Stage 2 : Image finale légère
# ─────────────────────────────────────────────
FROM node:20-alpine

# Métadonnées
LABEL maintainer="ProxyBot"
LABEL description="Bot Facebook Messenger - Achat de proxies"

WORKDIR /app

# Copie les node_modules depuis le builder
COPY --from=builder /app/node_modules ./node_modules

# Copie le code source
COPY . .

# Sécurité : utilisateur non-root
RUN addgroup -S botgroup && adduser -S botuser -G botgroup
USER botuser

# Port exposé (Back4App utilise la variable PORT automatiquement)
EXPOSE 3000

# Health check (Back4App vérifie la santé du conteneur)
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Démarrage
CMD ["node", "src/app.js"]
