#Base Image
FROM ghcr.io/nenokkadine/aria-telegram-mirror-bot:latest
WORKDIR /app/
CMD ["bash", "start.sh]
