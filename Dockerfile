FROM node
WORKDIR /usr/app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

COPY ./src/examples/poi-crosschecker/proto/NPOIMessage.proto ./dist/src/examples/poi-crosschecker/proto/
WORKDIR ./dist/src/examples/poi-crosschecker

ENV INDEXER_ADDRESS "0x365507a4eef5341cf00340f702f7f6e74217d96e"
ENV TESNET_INDEXER_ADDRESS "0xe9a1cabd57700b17945fd81feefba82340d9568f"
ENV GRAPH_NODE_HOST "host.docker.internal"
ENV ETH_NODE "host.docker.internal:8545"

CMD node poi-crosschecker.js
