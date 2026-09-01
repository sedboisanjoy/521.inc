// Package did provides DID generation and the salted-hash helpers that keep the
// Golden Rule: only hashes ever reach the ledger, never the underlying data.
package did

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
)

// New generates a fresh did:key-style identifier backed by an ed25519 key.
// For the prototype we return the DID plus a hash of its (off-chain) document.
// A production build would encode the key per the did:key multibase spec.
func New(prefix string) (didStr, docHash string, err error) {
	pub, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return "", "", fmt.Errorf("generate key: %w", err)
	}
	didStr = fmt.Sprintf("did:key:%s:%s", prefix, hex.EncodeToString(pub)[:32])
	docHash = Hash([]byte(didStr))
	return didStr, docHash, nil
}

// Salt returns a random 16-byte salt as hex, used so that identical credential
// contents do not produce identical (linkable) on-chain hashes.
func Salt() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// Hash returns the hex SHA-256 of b.
func Hash(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// SaltedHash returns SHA-256 over salt||payload — the value anchored on-chain.
func SaltedHash(salt string, payload []byte) string {
	return Hash(append([]byte(salt), payload...))
}
