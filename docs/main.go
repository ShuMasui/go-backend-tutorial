package main

import (
	"net/http"
)

func main() {
	dir := http.Dir("./api")
	http.Handle("/", http.FileServer(dir))
	http.ListenAndServe(":8081", nil)
}