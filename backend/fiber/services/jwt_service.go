package services

import (
	"crypto"
	"crypto/ed25519"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"fmt"

	"github.com/golang-jwt/jwt/v5"
	"github.com/velostream/fiber/models"
)

type tokenClaims struct {
	Username string `json:"username"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

// JwtService verifies asymmetric access tokens signed by backend/fastify using only the public key.
type JwtService struct {
	publicKey crypto.PublicKey
	issuer    string
	audience  string
	methods   []string
}

func NewJwtServiceFromPEM(pemBytes []byte, issuer, audience string) (*JwtService, error) {
	block, _ := pem.Decode(pemBytes)
	if block == nil {
		return nil, errors.New("invalid PEM block for JWT public key")
	}

	parsed, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse public key: %w", err)
	}

	var methods []string
	switch parsed.(type) {
	case ed25519.PublicKey:
		methods = []string{"EdDSA"}
	case *rsa.PublicKey:
		methods = []string{"RS256"}
	default:
		return nil, fmt.Errorf("unsupported public key type %T", parsed)
	}

	return &JwtService{
		publicKey: parsed,
		issuer:    issuer,
		audience:  audience,
		methods:   methods,
	}, nil
}

func (s *JwtService) Verify(tokenString string) (models.AuthClaims, error) {
	if tokenString == "" {
		return models.AuthClaims{}, errors.New("empty bearer token")
	}

	parsedClaims := &tokenClaims{}
	token, err := jwt.ParseWithClaims(
		tokenString,
		parsedClaims,
		func(_ *jwt.Token) (any, error) {
			return s.publicKey, nil
		},
		jwt.WithValidMethods(s.methods),
		jwt.WithIssuer(s.issuer),
		jwt.WithAudience(s.audience),
		jwt.WithExpirationRequired(),
	)
	if err != nil || !token.Valid {
		return models.AuthClaims{}, fmt.Errorf("invalid JWT: %w", err)
	}
	if parsedClaims.Subject == "" || parsedClaims.Username == "" {
		return models.AuthClaims{}, errors.New("JWT missing required subject or username claims")
	}

	return models.AuthClaims{
		UserID:   parsedClaims.Subject,
		Username: parsedClaims.Username,
		Role:     parsedClaims.Role,
	}, nil
}
