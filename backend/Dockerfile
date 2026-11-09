FROM node:22.23.4-alpine

RUN mkdir -p /app
WORKDIR /app
COPY package*.json ./
RUN apk --no-cache add --virtual builds-deps build-base python3 git && apk --no-cache add libreoffice fontconfig font-liberation font-dejavu font-noto && fc-cache -f
ENV NODE_ENV=prod
RUN npm ci --omit=dev
COPY . .
EXPOSE 4242
ENV NODE_ICU_DATA=node_modules/full-icu
ENTRYPOINT ["npm", "start"]
