FROM node:lts-slim
ARG userdir=/opt/app

WORKDIR ${userdir}

RUN  apt -y update && \
     mkdir -p ${userdir} && \
     echo \{\} > ${userdir}/package.json && \
     echo console.log\(\"hello\"\) > ${userdir}/index.js

COPY . .
RUN npx playwright install --with-deps chromium
RUN npm install -y

ENTRYPOINT ["npm","run","start"]