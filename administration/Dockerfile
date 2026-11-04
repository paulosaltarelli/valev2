FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .

ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
ENV TZ=America/Sao_Paulo
RUN npm run build


