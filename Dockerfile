FROM alpine:latest

RUN apk add --update nodejs npm
RUN apk add sqlite

WORKDIR /usr/app
COPY package.json ./
RUN npm install

COPY . .
RUN npm run build
RUN sqlite3 /usr/app/poi_crosschecker.db "VACUUM;"

WORKDIR /usr/app/dist/src/examples/poi-crosschecker
