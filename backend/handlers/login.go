package handlers

import (
	"backend/ent"
	"backend/ent/user"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"golang.org/x/crypto/bcrypt"
)

const GETLoginEndPoint = "POST /api/login"

type LoginHandler struct {
	client *ent.Client
}

func NewLoginHandler(client *ent.Client) *LoginHandler {
	return &LoginHandler{client: client}
}

type LoginRequestJsonBody struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type UserResponseJsonBody struct {
	Id        string `json:"id"`
	Username  string `json:"username"`
	Email     string `json:"email"`
	Bio       string `json:"bio"`
	AvatarUrl string `json:"avatar_url"`
}

type LoginResponseJsonBody struct {
	Token string               `json:"token"`
	User  UserResponseJsonBody `json:"user"`
}

func (lh *LoginHandler) Post() func(w http.ResponseWriter, r *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		var request LoginRequestJsonBody

		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			log.Printf("JSONパースエラーです")
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"message": "Invalid input credentials"}`))
			return
		}

		ctx := r.Context()

		var foundUser *ent.User
		foundUser, err := lh.client.User.Query().Where(user.EmailEQ(request.Email)).Only(ctx)

		if err != nil {
			log.Printf("ユーザーが見つかりませんでした")
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"message": "Invalid input credentials"}`))
			return
		}

		if err = bcrypt.CompareHashAndPassword([]byte(foundUser.Password), []byte(request.Password)); err != nil {
			log.Printf("パスワードが違いました")
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"message": "Invalid input credentials"}`))
			return
		}

		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"id":  foundUser.ID,
			"exp": time.Now().Add(time.Hour * 24).Unix(),
		})

		jwtSecret := os.Getenv("JWT_SECRET_TOKEN")

		tokenString, err := token.SignedString([]byte(jwtSecret))

		if err != nil {
			log.Printf("トークン発行不良です")
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"message": "Invalid input credentials"}`))
			return
		}

		log.Printf("%s", tokenString)

		res := &LoginResponseJsonBody{Token: tokenString, User: UserResponseJsonBody{
			Id:        foundUser.ID.String(),
			Username:  foundUser.Name,
			Email:     foundUser.Email,
			Bio:       foundUser.Profile,
			AvatarUrl: foundUser.AvatorURL,
		}}

		json, err := json.Marshal(res)

		if err != nil {
			log.Printf("エンコード不良です")
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(`{"message": "Invalid input credentials"}`))
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write(json)
	}
}
