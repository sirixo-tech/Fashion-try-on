FROM node:20-alpine

RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY integrations/shopify/package.json integrations/shopify/package-lock.json ./

RUN npm ci --omit=dev && npm cache clean --force

COPY tsconfig.base.json /tsconfig.base.json
COPY integrations/shopify/ ./

RUN npm run build

CMD ["npm", "run", "docker-start"]
