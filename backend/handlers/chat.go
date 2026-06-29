package handlers

import (
	"backend/ent"
	"backend/ent/user"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/google/uuid"
	"google.golang.org/genai"
)

const SseChatEndPoint = "/api/chat/stream"

type ChatHandler struct {
	client *ent.Client
}
func NewChatHander(client *ent.Client) (*ChatHandler) {
	return &ChatHandler{client: client}
}

type ChatRequestJsonBody struct {
	Prompt	string	`json:"prompt"`
}

func (ch *ChatHandler) Sse() (func(w http.ResponseWriter, r *http.Request)) {
	return func(w http.ResponseWriter, r *http.Request) {

		tokenString := r.Header.Get("Authorization")

		if tokenString == "" {
			log.Printf("Authorizationが設定されていません")
			w.Header().Add("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			w.Write([]byte(`{"message": "Invalid input credentials"}`))
			return
		}

		claims, err := AuthJwt(tokenString)

		if err != nil {
			log.Printf("JWTの認証でエラーが発生しました%v", err)
			w.Header().Add("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			w.Write([]byte(`{"message": "Invalid input credentials"}`))
			return
		}

		ctx := r.Context()

		id, ok := (*claims)["id"].(string)
		if !ok {
			log.Printf("データ型が不正です")
			w.Header().Add("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			w.Write([]byte(`{"message": "Invalid input credentials"}`))
			return
		}

		uuidFromId, err := uuid.Parse(id)

		if err != nil {
			log.Printf("uuid型に直せません")
			w.Header().Add("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			w.Write([]byte(`{"message": "Invalid input credentials"}`))
			return
		}

		var foundedUser *ent.User
		foundedUser, err = ch.client.User.Query().Where(user.IDEQ(uuidFromId)).Only(ctx)
		if err != nil {
			log.Printf("データベースのエラーです")
			w.Header().Add("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			w.Write([]byte(`{"message": "Invalid input credentials"}`))
			return
		}

		var request ChatRequestJsonBody
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			log.Printf("プロンプトのバインドエラーです: %v", err)

			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"message": "Invalid input credentials"}`))
			return
		}

		ctx = r.Context()

		prompt := fmt.Sprintf("あなたは素晴らしい相談相手です。以下のプロフィールを参考にしつつ、やってきたプロンプトに答えてください。\n# プロフィール\n%v\n\n# プロンプト\n%v", foundedUser.Profile, request.Prompt)

		gemini_key := os.Getenv("GEMINI_API_KEY")

		var geminiClient *genai.Client
		geminiClient, err = genai.NewClient(ctx, &genai.ClientConfig{APIKey: gemini_key})
		if err != nil {
			log.Printf("AI接続エラーです: %v", err)

			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"message": "Invalid input credentials"}`))
			return
		}

		stream := geminiClient.Models.GenerateContentStream(ctx, "gemini-3.5-flash", genai.Text(prompt), nil)

		flusher, ok := w.(http.Flusher)
		if !ok {
			log.Printf("SSE初期化に失敗: %v", err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"message": "Invalid input credentials"}`))
			return
		}

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.WriteHeader(http.StatusOK)





		for resp, err := range stream {
			select {
			case <- r.Context().Done():
				log.Printf("クライアント側から切断されました")
				return
			default:
			}

			if err != nil {
				// コンテキストキャンセルによる終了（クライアント切断による終了）なら正常終了として扱う
				if ctx.Err() != nil {
					log.Println("クライアントの切断によりGeminiストリームを中断しました。")
					return
				}

				log.Printf("Geminiエラー: %v", err)
				// クライアントへエラーイベントを送信して終了
				fmt.Fprintf(w, "event: error\ndata: %s\n\n", "Internal server error")
				flusher.Flush()
				return
			}

			for _, candidate := range resp.Candidates {
				if candidate.Content != nil {
					for _, part := range candidate.Content.Parts {
						fmt.Fprintf(w, "data: %s\n\n", part.Text)

						flusher.Flush()

					}
				}
			}
		}
	}
}