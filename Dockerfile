# One-shot API test-runner image (RRDPLAT-97). Runs a suite against RR_BASE_URL, writes JUnit, spec output and
# summary.json to $RR_OUT_DIR/$RR_RUN_ID/ and exits 0 (passed), 1 (failures) or 2 (config error). See README "Runner image".
# The build needs the GitHub Packages token for @buildproveship/config as a BuildKit secret, never as a build argument:
#   docker build --secret id=npmrc,src=$HOME/.npmrc -t api-runner .
FROM node:24-bookworm-slim@sha256:873f586f3794f52281bd039bf02c048a0be08fde619338f9941bad1eb6b34530 AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=secret,id=npmrc,target=/run/secrets/npmrc \
    npm ci --ignore-scripts --userconfig /run/secrets/npmrc
COPY tsconfig.json ./
COPY src ./src
COPY performance/loopback.ts ./performance/loopback.ts
COPY tests ./tests
RUN npm run build

FROM node:24-bookworm-slim@sha256:873f586f3794f52281bd039bf02c048a0be08fde619338f9941bad1eb6b34530 AS runtime
ENV NODE_ENV=production \
    RR_OUT_DIR=/out
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
RUN mkdir /out && chown node:node /out
USER node
ENTRYPOINT ["node", "dist/src/runner/main.js"]
