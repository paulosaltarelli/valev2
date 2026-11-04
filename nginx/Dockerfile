FROM node:22-alpine AS admin_build
WORKDIR /app
COPY administration/package*.json ./administration/
RUN cd administration && npm ci --legacy-peer-deps
COPY administration ./administration
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN cd administration && npm run build

FROM nginx:1.27-alpine
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=admin_build /app/administration/dist /usr/share/nginx/html


