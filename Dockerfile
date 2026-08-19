FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --prod --frozen-lockfile
COPY src ./src
COPY public ./public
COPY db ./db
EXPOSE 8787
USER node
CMD ["node", "src/server.js"]
