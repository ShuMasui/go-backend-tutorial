package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"

	"backend/ent"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"

	"backend/handlers"
)

type database struct {
	client *ent.Client
}

type handleDatabase interface {
	Close()
}

func (d *database) Close() {
	d.client.Close()
}

func NewDatabase(client *ent.Client) (d *database) {

	return &database{client: client}
}

func ConnectDB() (*ent.Client, error) {
	dbUser := os.Getenv("POSTGRES_USER")
	dbPassword := os.Getenv("POSTGRES_PASSWORD")
	dbName := os.Getenv("POSTGRES_DB")
	dbHost := os.Getenv("DB_HOST")

	if dbHost == "" {
		dbHost = "localhost"
	}

	dbPort := "5432"

	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=disable TimeZone=Asia/Tokyo", dbHost, dbUser, dbPassword, dbName, dbPort)

	// ent クライアントの作成
	client, err := ent.Open("postgres", dsn)

	return client, err
}

func (d *database) MigrateDB() error {
	ctx := context.Background()

	return d.client.Schema.Create(ctx)
}

func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// フロントエンドのURLを許可（すべての場合は "*" ）
		w.Header().Set("Access-Control-Allow-Origin", "*") 
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		// プリフライト（OPTIONS）リクエストへの対応
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func main() {
	if err := godotenv.Load(); err != nil {
		log.Fatal("環境変数の読み込みでエラーが発生しました")
		return
	}

	client, err := ConnectDB()

	if err != nil {
		log.Fatalf("entによるデータベースへの接続が失敗しました")
		return
	}

	db := NewDatabase(client)

	// main関数の実行終了時にまとめて、接続を閉じる
	defer db.Close()

	// 自動マイグレーションの実行（テーブル作成）
	if err = db.MigrateDB(); err != nil {
		log.Fatalf("entによるマイグレーションが失敗しました%v", err)
		return
	}

	signupHandler := handlers.NewSignupHandler(client)
	loginHandker := handlers.NewLoginHandler(client)
	profileHandler := handlers.NewProfileHandler(client)
	chathandler := handlers.NewChatHander(client)

	http.HandleFunc(handlers.GETSignupEndPoint, signupHandler.Post())
	http.HandleFunc(handlers.GETLoginEndPoint, loginHandker.Post())
	http.HandleFunc(handlers.GETProfileEndPoint, profileHandler.Get())
	http.HandleFunc(handlers.PUTProfileEndPoint, profileHandler.Put())
	http.HandleFunc(handlers.SseChatEndPoint, chathandler.Sse())

	http.ListenAndServe(":8080", CORS(http.DefaultServeMux))
}
