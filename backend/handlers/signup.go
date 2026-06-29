package handlers

import (
	"backend/ent"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"golang.org/x/crypto/bcrypt"
)

const GETSignupEndPoint = "POST /api/signup"

type SignupHandler struct {
	client *ent.Client
}

func NewSignupHandler(client *ent.Client) *SignupHandler {
	return &SignupHandler{client: client}
}

// JSONリクエストボディの定義
type SignupRequestJsonBody struct {
	Name     string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type AvatorImage struct {
	Url string `json:"url"`
}

func (sh *SignupHandler) Post() func(w http.ResponseWriter, r *http.Request) {

	return func(w http.ResponseWriter, r *http.Request) {
		var request SignupRequestJsonBody

		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			log.Printf("Singupバインドエラーです: %v", err)

			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"message": "Invalid input credentials"}`))
			return
		}

		avatorUrl, err := getAvator(request.Name)

		if err != nil {
			log.Printf("プロフィール画像取得エラーです: %v", err)

			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"message": "Invalid input credentials"}`))
			return
		}

		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(request.Password), bcrypt.DefaultCost)

		if err != nil {
			log.Printf("ハッシュ値生成エラーです: %v", err)

			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"message": "Invalid input credentials"}`))
			return
		}

		ctx := r.Context()

		_, err = sh.client.User.Create().
			SetName(request.Name).
			SetEmail(request.Email).
			SetAvatorURL(avatorUrl.Url).
			SetPassword(string(hashedPassword)).
			Save(ctx)

		if err != nil {
			log.Printf("データベース接続でエラーが発生しました: %v", err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"message": "Invalid input credentials"}`))
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"message": "Account created successfully"}`))

	}
}

func getAvator(name string) (*AvatorImage, error) {
	url := fmt.Sprintf("https://foundry-avatar-api.boy0914.workers.dev/avatar?name=%v+go", name)

	avatorImage := &AvatorImage{}

	avatorImage.Url = url

	return avatorImage, nil
}
