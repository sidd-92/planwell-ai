# ---- build: compile the React client and the Express server ----
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime: production dependencies + compiled output only ----
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
# Make the build output readable by the non-root runtime user, whatever the source file modes were.
COPY --from=build /app/dist ./dist
RUN chmod -R a+rX ./dist
USER node
# Cloud Run sets PORT (default 8080)
EXPOSE 8080
CMD ["node", "dist/server/server/index.js"]
