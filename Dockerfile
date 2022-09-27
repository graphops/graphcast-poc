FROM node
WORKDIR /usr/app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

WORKDIR /usr/app/dist/src/examples/poi-crosschecker
CMD node poi-crosschecker.js
