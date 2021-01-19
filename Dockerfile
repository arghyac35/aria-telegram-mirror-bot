#Base Image
FROM ghcr.io/arghyac35/aria-telegram-mirror-bot:master

WORKDIR /bot/

CMD ["bash", "start.sh"]
