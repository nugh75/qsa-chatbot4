### Stage 1: Build frontend assets
FROM node:20-alpine AS build
WORKDIR /app

# Install deps first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm ci || npm install

# Copy sources
COPY . .

# Build arguments for multi-site configuration
ARG VITE_BACKEND_URL
ARG VITE_BACKEND_TARGET
ARG VITE_SITE_NAME=default

# Set environment variables for build
ENV VITE_BACKEND_URL=${VITE_BACKEND_URL}
ENV VITE_BACKEND_TARGET=${VITE_BACKEND_TARGET}
ENV VITE_SITE_NAME=${VITE_SITE_NAME}

# Build production bundle
RUN npm run build

### Stage 2: Runtime (nginx serving static files)
FROM nginx:1.27-alpine AS runtime

WORKDIR /usr/share/nginx/html

# Copy built assets (using the site-specific dist directory)
ARG VITE_SITE_NAME=default
COPY --from=build /app/dist-${VITE_SITE_NAME} ./

# Custom nginx config (site-specific)
ARG VITE_SITE_NAME=default
COPY nginx-multi.conf /etc/nginx/conf.d/default.conf

EXPOSE 5175

# Healthcheck (simple static file)
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:5175/ || exit 1

# Run nginx in foreground
CMD ["nginx","-g","daemon off;"]
