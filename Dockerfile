#Base Image
FROM ghcr.io/arghyac35/aria-telegram-mirror-bot:master

WORKDIR /app/

CMD ["bash", "start.sh"]
