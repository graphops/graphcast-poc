FROM node
WORKDIR /usr/app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

COPY ./src/examples/poi-crosschecker/proto/NPOIMessage.proto ./dist/src/examples/poi-crosschecker/proto/
WORKDIR ./dist/src/examples/poi-crosschecker

ENV DEFAULT_LISTEN_TOPICS "QmeccoXogKyEBBewvfwK7D391XzdnkBkLmEboXE9cE9X8N"
ENV OPS_MAINNET_INDEXER_ADDRESS "0x365507a4eef5341cf00340f702f7f6e74217d96e"
ENV INDEXER_ADDRESS "0xe9a1cabd57700b17945fd81feefba82340d9568f"
ENV TESTNET_RAND_INDEXER_ADDRESS "0xa8b2b5c22e5c13e9f789284b067736d906a5afa9"
ENV GRAPH_NODE_HOST "host.docker.internal"
ENV ETH_NODE "host.docker.internal:8545"
ENV NETWORK_URL "https://gateway.testnet.thegraph.com/network"

CMD node poi-crosschecker.js
