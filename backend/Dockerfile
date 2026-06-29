# 1. ビルド用ステージ (コンパイル環境)
FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .

# Dockerが自動注入するターゲットプラットフォーム変数を宣言
ARG TARGETOS
ARG TARGETARCH

# 依存関係のない静的リンクバイナリをビルド（ターゲット環境に合わせて動的にコンパイル）
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -o main .

# 2. 実行用ステージ (最小限の環境)
FROM alpine:latest
RUN apk --no-cache add ca-certificates # Gemini(HTTPS)通信に必須のルート証明書
WORKDIR /root/
# ビルダーステージからコンパイル済みの実行バイナリのみをコピー
COPY --from=builder /app/main .
COPY .env ./

RUN chmod +x ./main

EXPOSE 8080
CMD ["./main"]