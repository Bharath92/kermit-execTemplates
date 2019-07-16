FROM ${MICRO_NAME}:${MICRO_TAG}

ADD . /jfrog/execTemplates

ENV EXEC_TEMPLATES_DIR=/jfrog/execTemplates
