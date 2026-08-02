FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Единственная переменная сборки веба. Всё, что попадает в бандл через VITE_*,
# видно любому пользователю в браузере, поэтому секретов здесь нет и быть не
# может — ключи провайдеров остаются на бэкенде.
# Аргументы VITE_SUPABASE_* убраны: Supabase из продукта удалён.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
EXPOSE 80
CMD ["/docker-entrypoint.sh"]
