package tests

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/x509"
	"encoding/pem"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/velostream/fiber/services"
)

func generateTestEd25519Keys(t *testing.T) (ed25519.PrivateKey, []byte) {
	t.Helper()
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("generate ed25519 keypair: %v", err)
	}
	der, err := x509.MarshalPKIXPublicKey(pub)
	if err != nil {
		t.Fatalf("marshal public key: %v", err)
	}
	pubPEM := pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: der})
	return priv, pubPEM
}

func signTestToken(t *testing.T, priv ed25519.PrivateKey, iss, aud, sub, username string, exp time.Time) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodEdDSA, jwt.MapClaims{
		"iss":      iss,
		"aud":      aud,
		"sub":      sub,
		"username": username,
		"role":     "USER",
		"exp":      exp.Unix(),
		"iat":      time.Now().Unix(),
	})
	signed, err := tok.SignedString(priv)
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return signed
}

func TestJwtService_Verify(t *testing.T) {
	priv, pubPEM := generateTestEd25519Keys(t)
	jwtSvc, err := services.NewJwtServiceFromPEM(pubPEM, "velostream-fastify", "velostream-clients")
	if err != nil {
		t.Fatalf("new jwt service: %v", err)
	}

	valid := signTestToken(t, priv, "velostream-fastify", "velostream-clients", "usr_1", "viewer1", time.Now().Add(5*time.Minute))
	claims, err := jwtSvc.Verify(valid)
	if err != nil {
		t.Fatalf("expected valid token to verify, got: %v", err)
	}
	if claims.UserID != "usr_1" || claims.Username != "viewer1" {
		t.Fatalf("unexpected claims: %+v", claims)
	}

	expired := signTestToken(t, priv, "velostream-fastify", "velostream-clients", "usr_1", "viewer1", time.Now().Add(-1*time.Minute))
	if _, err := jwtSvc.Verify(expired); err == nil {
		t.Fatal("expected expired token to fail verification")
	}

	wrongIss := signTestToken(t, priv, "other-issuer", "velostream-clients", "usr_1", "viewer1", time.Now().Add(5*time.Minute))
	if _, err := jwtSvc.Verify(wrongIss); err == nil {
		t.Fatal("expected wrong issuer token to fail verification")
	}

	otherPriv, _ := generateTestEd25519Keys(t)
	wrongKey := signTestToken(t, otherPriv, "velostream-fastify", "velostream-clients", "usr_1", "viewer1", time.Now().Add(5*time.Minute))
	if _, err := jwtSvc.Verify(wrongKey); err == nil {
		t.Fatal("expected token signed with wrong key to fail verification")
	}
}
