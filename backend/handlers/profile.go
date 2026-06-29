package handlers

import (
	"backend/ent"
	"backend/ent/user"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const GETProfileEndPoint = "GET /api/profile"
const PUTProfileEndPoint = "PUT /api/profile"

type ProfileHandler struct {
	client *ent.Client
}

func NewProfileHandler(client *ent.Client) *ProfileHandler {
	return &ProfileHandler{client: client}
}

func AuthJwt(tokenString string) (*jwt.MapClaims, error) {
	const bearerPrefix = "Bearer "
	if !strings.HasPrefix(tokenString, bearerPrefix) {
		return nil, fmt.Errorf("Bearerが設定されていません")
	}

	tmpToken := strings.TrimPrefix(tokenString, bearerPrefix)

	token, err := jwt.Parse(tmpToken, func(t *jwt.Token) (any, error) {
		secret := []byte(os.Getenv("JWT_SECRET_TOKEN"))
		return secret, nil
	})

	if err != nil {
		return nil, fmt.Errorf("トークンをパースできませんでした")
	}

	claims, ok := token.Claims.(jwt.MapClaims)

	if !ok {
		return nil, fmt.Errorf("クレームの内容が既定のものではありませんでした")
	}

	if time.Now().Unix() > int64(claims["exp"].(float64)) {
		return nil, fmt.Errorf("JWTの有効期限が切れています")
	}

	return &claims, nil
}

func (ph *ProfileHandler) Get() func(w http.ResponseWriter, r *http.Request) {
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

		var foundedUser *ent.User
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

		foundedUser, err = ph.client.User.Query().Where(user.IDEQ(uuidFromId)).Only(ctx)

		if err != nil {
			log.Printf("データベース検索エラーです")
			w.Header().Add("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			w.Write([]byte(`{"message": "Invalid input credentials"}`))
			return
		}

		res := &UserResponseJsonBody{
			Id:        foundedUser.ID.String(),
			Username:  foundedUser.Name,
			Email:     foundedUser.Email,
			Bio:       foundedUser.Profile,
			AvatarUrl: foundedUser.AvatorURL,
		}

		json, err := json.Marshal(res)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write(json)
	}
}

type ProfileRequestJsonBody struct {
	Name	string	`json:"username"`
	Profile	string	`json:"bio"`
	AvatarUrl string	`json:"avatar_url"`
}

func (ph *ProfileHandler) Put() (func(w http.ResponseWriter, r *http.Request)) {
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

		var request ProfileRequestJsonBody
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			log.Printf("リクエストが不正です")
			w.Header().Add("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			w.Write([]byte(`{"message": "Invalid input credentials"}`))
			return
		}
		

		var newUser *ent.User
		newUser, err = ph.client.User.UpdateOneID(uuidFromId).SetName(request.Name).SetAvatorURL(request.AvatarUrl).SetProfile(request.Profile).Save(ctx)

		if err != nil {
			log.Printf("データベース更新中にエラーが発生しました")
			w.Header().Add("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			w.Write([]byte(`{"message": "Invalid input credentials"}`))
			return
		}

		res := &UserResponseJsonBody{
			Id:        newUser.ID.String(),
			Username:  newUser.Name,
			Email:     newUser.Email,
			Bio:       newUser.Profile,
			AvatarUrl: newUser.AvatorURL,
		}

		json, err := json.Marshal(res)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write(json)
	}
}
