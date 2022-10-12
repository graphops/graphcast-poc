FROM alpine:latest

RUN apk add --update nodejs npm
RUN apk add sqlite

WORKDIR /usr/app
COPY package.json ./
RUN npm install

COPY . .
RUN npm run build
RUN sqlite3 /usr/app/dist/src/examples/poi-crosschecker/npois.db "VACUUM;"

WORKDIR /usr/app/dist/src/examples/poi-crosschecker

ENV TERM "xterm-256color"
ENV LOG_LEVEL "trace"
ENV ETH_NODE "<ETH_NODE>"
ENV REGISTRY_SUBGRAPH "https://api.thegraph.com/subgraphs/name/hopeyen/gossip-registry-test"

CMD node poi-crosschecker.js
