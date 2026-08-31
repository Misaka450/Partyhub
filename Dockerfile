FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# 使用非 root 的安全 node 用户运行
USER node

EXPOSE 8080

CMD ["node", "server.js"]
