# ---- Build stage ----
FROM node:20-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm i -g @quasar/cli
RUN npm install --ignore-scripts

COPY . .
RUN npx quasar prepare
RUN npx quasar build

# ---- Runtime stage ----
FROM nginx:alpine

# Copy built Quasar app
COPY --from=build /app/dist/spa /usr/share/nginx/html

# Copy nginx template and entrypoint
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
