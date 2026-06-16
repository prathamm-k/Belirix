FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

EXPOSE 2002

CMD ["npm", "run", "dev"]
