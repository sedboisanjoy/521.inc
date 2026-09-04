FROM node:20-alpine AS web-build
WORKDIR /src/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM golang:1.22-alpine AS api-build
WORKDIR /src/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 go build -o /out/employment-passport .

FROM alpine:3.20
WORKDIR /app
COPY --from=api-build /out/employment-passport ./employment-passport
COPY --from=web-build /src/web/dist ./web/dist
ENV LEDGER_MODE=mock
ENV ADDR=:8080
ENV STATIC_DIR=/app/web/dist
EXPOSE 8080
CMD ["/app/employment-passport"]