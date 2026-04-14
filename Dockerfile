FROM node:20-alpine

WORKDIR /app

# Copy package info and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy server logic and public facing assets
COPY server.js .
COPY presets.json .
COPY public/ ./public/

# Expose port
EXPOSE 3000

# Start server
CMD ["npm", "start"]
