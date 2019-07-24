FROM ${BASE_IMAGE}:${BASE_TAG}

ENV NODE_PATH=/shippable/node_modules

ENV BASH_ENV=/etc/drydock/.env

ADD ${MICRO_PATH} /shippable/micro

ADD ${EXEC_TEMPLATES_PATH} /jfrog/execTemplates

ENV EXEC_TEMPLATES_DIR=/jfrog/execTemplates

ADD ${MICRO_PATH}/nod/_global/shippable_retry /shippable/shipctl/shippable_retry

ENV PATH="$PATH:/shippable/shipctl/"

RUN . ~/.nvm/nvm.sh && nvm install 8.16.0 && nvm use 8.16.0 && cd /shippable/micro/nod && npm install

CMD . ~/.nvm/nvm.sh && nvm use 8.16.0 && node app.js
