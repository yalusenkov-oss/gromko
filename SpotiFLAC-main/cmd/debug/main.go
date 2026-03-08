package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"time"

	"github.com/pquerna/otp"
	"github.com/pquerna/otp/totp"
)

func main() {
	client := &http.Client{Timeout: 30 * time.Second}
	cookies := make(map[string]string)

	// Step 1: Get session info
	fmt.Println("=== Step 1: getSessionInfo ===")
	req, _ := http.NewRequest("GET", "https://open.spotify.com", nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")

	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("ERROR: %v\n", err)
		return
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	fmt.Printf("Status: %d\n", resp.StatusCode)

	var clientVersion string
	re := regexp.MustCompile(`<script id="appServerConfig" type="text/plain">([^<]+)</script>`)
	matches := re.FindStringSubmatch(string(body))
	if len(matches) > 1 {
		decoded, err := base64.StdEncoding.DecodeString(matches[1])
		if err == nil {
			var cfg map[string]interface{}
			if json.Unmarshal(decoded, &cfg) == nil {
				clientVersion = cfg["clientVersion"].(string)
				fmt.Printf("clientVersion: %s\n", clientVersion)
			}
		}
	} else {
		fmt.Println("WARNING: no appServerConfig found!")
		// Try to find version in page source
		re2 := regexp.MustCompile(`"clientVersion":"([^"]+)"`)
		m2 := re2.FindStringSubmatch(string(body))
		if len(m2) > 1 {
			clientVersion = m2[1]
			fmt.Printf("clientVersion (from regex): %s\n", clientVersion)
		} else {
			fmt.Println("Could not find clientVersion!")
			// Print first 2000 chars of page for debug
			if len(body) > 2000 {
				fmt.Printf("Page start: %s\n", string(body[:2000]))
			} else {
				fmt.Printf("Page: %s\n", string(body))
			}
		}
	}

	var deviceID string
	for _, cookie := range resp.Cookies() {
		cookies[cookie.Name] = cookie.Value
		if cookie.Name == "sp_t" {
			deviceID = cookie.Value
		}
	}
	fmt.Printf("deviceID (sp_t): %s\n", deviceID)
	fmt.Printf("Cookies: %d\n", len(cookies))

	// Step 2: Get access token
	fmt.Println("\n=== Step 2: getAccessToken ===")
	secret := "GM3TMMJTGYZTQNZVGM4DINJZHA4TGOBYGMZTCMRTGEYDSMJRHE4TEOBUG4YTCMRUGQ4DQOJUGQYTAMRRGA2TCMJSHE3TCMBY"
	version := 61

	key, _ := otp.NewKeyFromURL(fmt.Sprintf("otpauth://totp/secret?secret=%s", secret))
	totpCode, _ := totp.GenerateCode(key.Secret(), time.Now())
	fmt.Printf("TOTP code: %s, version: %d\n", totpCode, version)

	req, _ = http.NewRequest("GET", "https://open.spotify.com/api/token", nil)
	q := req.URL.Query()
	q.Add("reason", "init")
	q.Add("productType", "web-player")
	q.Add("totp", totpCode)
	q.Add("totpVer", strconv.Itoa(version))
	q.Add("totpServer", totpCode)
	req.URL.RawQuery = q.Encode()

	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
	req.Header.Set("Content-Type", "application/json;charset=UTF-8")

	for name, value := range cookies {
		req.AddCookie(&http.Cookie{Name: name, Value: value})
	}

	resp, err = client.Do(req)
	if err != nil {
		fmt.Printf("ERROR: %v\n", err)
		return
	}
	body, _ = io.ReadAll(resp.Body)
	resp.Body.Close()
	fmt.Printf("Status: %d\n", resp.StatusCode)

	if resp.StatusCode != 200 {
		fmt.Printf("Error body: %s\n", string(body))
		return
	}

	var tokenData map[string]interface{}
	json.Unmarshal(body, &tokenData)

	accessToken := ""
	clientID := ""
	if at, ok := tokenData["accessToken"].(string); ok {
		accessToken = at
		fmt.Printf("accessToken: %s...\n", accessToken[:30])
	}
	if ci, ok := tokenData["clientId"].(string); ok {
		clientID = ci
		fmt.Printf("clientID: %s\n", clientID)
	}

	for _, cookie := range resp.Cookies() {
		cookies[cookie.Name] = cookie.Value
		if cookie.Name == "sp_t" {
			deviceID = cookie.Value
		}
	}

	// Step 3: Get client token
	fmt.Println("\n=== Step 3: getClientToken ===")
	fmt.Printf("Using: clientVersion=%s, clientID=%s, deviceID=%s\n", clientVersion, clientID, deviceID)

	if clientVersion == "" {
		clientVersion = "1.2.52.442.g0f7a4e37"
		fmt.Printf("Using fallback clientVersion: %s\n", clientVersion)
	}

	payload := map[string]interface{}{
		"client_data": map[string]interface{}{
			"client_version": clientVersion,
			"client_id":      clientID,
			"js_sdk_data": map[string]interface{}{
				"device_brand": "unknown",
				"device_model": "unknown",
				"os":           "windows",
				"os_version":   "NT 10.0",
				"device_id":    deviceID,
				"device_type":  "computer",
			},
		},
	}

	jsonData, _ := json.Marshal(payload)
	fmt.Printf("Payload: %s\n", string(jsonData))

	req, _ = http.NewRequest("POST", "https://clienttoken.spotify.com/v1/clienttoken", bytes.NewBuffer(jsonData))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")

	resp, err = client.Do(req)
	if err != nil {
		fmt.Printf("ERROR: %v\n", err)
		return
	}
	body, _ = io.ReadAll(resp.Body)
	resp.Body.Close()
	fmt.Printf("Status: %d\n", resp.StatusCode)
	fmt.Printf("Body: %s\n", string(body))

	if resp.StatusCode == 200 {
		var ctData map[string]interface{}
		json.Unmarshal(body, &ctData)
		fmt.Printf("response_type: %v\n", ctData["response_type"])
		if gt, ok := ctData["granted_token"].(map[string]interface{}); ok {
			fmt.Printf("client token: %s...\n", gt["token"].(string)[:30])
		}
		fmt.Println("\n✅ ALL STEPS PASSED!")
	}
}
