FROM node:20-alpine

WORKDIR /app

# Copy dependency files first (better Docker layer caching)
COPY package.json package-lock.json ./

# Use npm ci — never npm install — for reproducible installs
RUN npm ci --omit=dev

COPY . .

RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "preview"]

