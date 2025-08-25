FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install || true
COPY . .
ENV VITE_BACKEND_URL=http://backend:8005
EXPOSE 5175
CMD ["npm","run","dev","--","--host","0.0.0.0","--port","5175"]
