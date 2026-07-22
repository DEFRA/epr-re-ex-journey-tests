FROM node:26.4.0-alpine@sha256:725aeba2364a9b16beae49e180d83bd597dbd0b15c47f1f28875c290bfd255b9
WORKDIR /app
COPY ./docker/mock/waste.organisations.cjs .
EXPOSE 3020
CMD ["node", "waste.organisations.cjs"]
