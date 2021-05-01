#NodeJS Alpine Build
FROM node:alpine3.10

#Installation of dependencies
RUN apk add --no-cache --update \
    ca-certificates \
    git \
    bash \
    aria2 \
    curl

RUN npm i -g typescript

RUN mkdir /bot
RUN chmod 777 /bot
WORKDIR /bot

ADD bot.tar /bot/

CMD ["bash","start.sh"]