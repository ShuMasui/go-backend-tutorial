package errs

import (
	"fmt"
)
type AppError struct {
	Code	int
	Message	string
	Err	error
}

func (e *AppError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("status: %d, message: %s, internal_err: %v", e.Code, e.Message, e.Err)
	}

	return fmt.Sprintf("status: %d, message: %s", e.Code, e.Message)
}