#NodeJS Alpine Build
FROM node:alpine3.10
#Setting Work Directory
WORKDIR /app/
# Setting Up All Permissions to all users to the Workdir
RUN chmod 777 /app
#Installation of dependencies
RUN apk add --no-cache --update \
      ca-certificates \
      git \
      bash \
      aria2 \
      wget \
      unzip
# Copy all files from BuildDir to Workdir
COPY . .
#Building and Installation
RUN mv src/.constants.js.example src/.constants.js && \
    npm i -g typescript && \
    yarn && \
    tsc && \
    rm -rf src/.constants.js && \
    rm -rf out/.constants.js
