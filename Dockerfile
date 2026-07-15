FROM node:20-slim

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy workspace config files first
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json tsconfig.base.json ./

# Copy all packages
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/
COPY scripts/ ./scripts/

# Install dependencies
RUN pnpm install --no-frozen-lockfile

# Build the api-server
RUN pnpm --filter @workspace/api-server run build

EXPOSE 3000

ENV PORT=3000

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
