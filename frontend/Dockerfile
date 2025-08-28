### Stage 1: Build frontend assets
FROM node:20-alpine AS build
WORKDIR /app

# Install deps first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm ci || npm install

# Copy sources
COPY . .

# Allow optional override at build time: docker build --build-arg VITE_BACKEND_URL=https://cb.ai4educ.org .
ARG VITE_BACKEND_URL
ENV VITE_BACKEND_URL=${VITE_BACKEND_URL}

# Build production bundle
RUN npm run build

### Stage 2: Runtime (nginx serving static files)
FROM nginx:1.27-alpine AS runtime

WORKDIR /usr/share/nginx/html

# Copy built assets
COPY --from=build /app/dist ./

# Custom nginx config (expects file provided alongside Dockerfile)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 5175

# Healthcheck (simple static file)
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:5175/ || exit 1

# Run nginx in foreground
CMD ["nginx","-g","daemon off;"]
