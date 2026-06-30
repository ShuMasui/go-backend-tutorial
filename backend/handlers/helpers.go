package handlers

import (
	"backend/errs"
	"encoding/json"
	"errors"
	"log"
	"net/http"
)

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"message": message})
}

// errにはappErrのポインターを挿入してください
//
// すると書き込んで返してくれます
func HandleError(w http.ResponseWriter, err error) {
	
	var appErr *errs.AppError


	if errors.As(err, &appErr) {
		if appErr.Err != nil {
			log.Printf("[Error]Internal: %v, ClientMessage: %v", appErr.Err, appErr.Message)
		} else {
			log.Printf("[Error]Message: %v", appErr.Message)
		}

		writeError(w, appErr.Code, appErr.Message)
		return
	} 
	
	// appErr以外がこのhandleerrorを呼び出した場合
	log.Printf("[UNHANDLED ERROR]: %v", err)
	writeError(w, http.StatusInternalServerError, "UNHANDLED ERROR OCCURED")
}