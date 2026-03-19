FROM node:18-alpine

WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY prisma ./prisma
COPY src ./src

RUN npm run prisma:generate
RUN npm run build

EXPOSE 4000
CMD ["node", "dist/main.js"]
