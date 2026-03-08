// SpotiFLAC HTTP Server — standalone REST API wrapper for the SpotiFLAC backend.
// Used by GROMKO to fetch Spotify metadata and download tracks.
//
// Endpoints:
//   GET  /health                          — health check
//   GET  /api/metadata?url=<spotify_url>  — fetch metadata (track/album/playlist)
//   POST /api/download                    — download a single track
//   GET  /api/search?q=<query>&limit=10   — search Spotify
//
// Usage:
//   cd SpotiFLAC-main && go run ./cmd/server
//
// Environment:
//   SPOTIFLAC_PORT (default 3099)
//   SPOTIFLAC_DOWNLOAD_DIR (default ./downloads)

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/afkarxyz/SpotiFLAC/backend"
)

var (
	downloadDir string
	mu          sync.Mutex
)

func main() {
	port := os.Getenv("SPOTIFLAC_PORT")
	if port == "" {
		port = "3099"
	}

	downloadDir = os.Getenv("SPOTIFLAC_DOWNLOAD_DIR")
	if downloadDir == "" {
		downloadDir = filepath.Join(".", "downloads")
	}
	os.MkdirAll(downloadDir, 0755)

	mux := http.NewServeMux()
	mux.HandleFunc("/health", handleHealth)
	mux.HandleFunc("/api/metadata", handleMetadata)
	mux.HandleFunc("/api/download", handleDownload)
	mux.HandleFunc("/api/search", handleSearch)

	// Serve downloaded files
	mux.Handle("/downloads/", http.StripPrefix("/downloads/", http.FileServer(http.Dir(downloadDir))))

	log.Printf("🎵 SpotiFLAC API server starting on :%s", port)
	log.Printf("📁 Download directory: %s", downloadDir)

	if err := http.ListenAndServe(":"+port, corsMiddleware(mux)); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == "OPTIONS" {
			w.WriteHeader(200)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func jsonResponse(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func jsonError(w http.ResponseWriter, status int, msg string) {
	jsonResponse(w, status, map[string]string{"error": msg})
}

// ─── Health ───

func handleHealth(w http.ResponseWriter, r *http.Request) {
	jsonResponse(w, 200, map[string]string{"status": "ok", "service": "spotiflac"})
}

// ─── Metadata ───

func handleMetadata(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonError(w, 405, "Method not allowed")
		return
	}

	spotifyURL := r.URL.Query().Get("url")
	if spotifyURL == "" {
		jsonError(w, 400, "Missing 'url' parameter")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()

	data, err := backend.GetFilteredSpotifyData(ctx, spotifyURL, false, time.Second)
	if err != nil {
		jsonError(w, 500, fmt.Sprintf("Failed to fetch metadata: %v", err))
		return
	}

	jsonResponse(w, 200, data)
}

// ─── Download ───

type DownloadRequest struct {
	SpotifyURL  string `json:"spotify_url"`
	SpotifyID   string `json:"spotify_id"`
	TrackName   string `json:"track_name"`
	ArtistName  string `json:"artist_name"`
	AlbumName   string `json:"album_name"`
	AlbumArtist string `json:"album_artist"`
	ReleaseDate string `json:"release_date"`
	CoverURL    string `json:"cover_url"`
	TrackNumber int    `json:"track_number"`
	DiscNumber  int    `json:"disc_number"`
	TotalTracks int    `json:"total_tracks"`
	TotalDiscs  int    `json:"total_discs"`
	Service     string `json:"service"` // tidal, qobuz, deezer, amazon
	Quality     string `json:"quality"` // LOSSLESS, HIGH, etc.
}

type DownloadResponse struct {
	Success  bool   `json:"success"`
	FilePath string `json:"file_path,omitempty"`
	FileName string `json:"file_name,omitempty"`
	FileSize int64  `json:"file_size,omitempty"`
	Format   string `json:"format,omitempty"`
	Error    string `json:"error,omitempty"`
}

func handleDownload(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		jsonError(w, 405, "Method not allowed")
		return
	}

	var req DownloadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, 400, "Invalid JSON body")
		return
	}

	if req.SpotifyID == "" && req.SpotifyURL != "" {
		// Extract ID from URL
		req.SpotifyID = extractSpotifyID(req.SpotifyURL)
	}

	if req.SpotifyID == "" {
		jsonError(w, 400, "spotify_id or spotify_url is required")
		return
	}

	if req.Service == "" {
		req.Service = "deezer"
	}
	if req.Quality == "" {
		req.Quality = "LOSSLESS"
	}

	// Use a unique subfolder per download to avoid collisions
	trackDir := filepath.Join(downloadDir, fmt.Sprintf("%s_%d", req.SpotifyID, time.Now().UnixNano()))
	os.MkdirAll(trackDir, 0755)

	mu.Lock()
	defer mu.Unlock()

	spotifyURL := fmt.Sprintf("https://open.spotify.com/track/%s", req.SpotifyID)

	var filename string
	var err error

	switch req.Service {
	case "deezer":
		downloader := backend.NewDeezerDownloader()
		filename, err = downloader.Download(
			req.SpotifyID, trackDir, "title-artist", "", "", false, 0,
			req.TrackName, req.ArtistName, req.AlbumName, req.AlbumArtist,
			req.ReleaseDate, req.CoverURL, req.TrackNumber, req.DiscNumber,
			req.TotalTracks, false, req.TotalDiscs, "", "", spotifyURL,
			false, false, false,
		)

	case "tidal":
		downloader := backend.NewTidalDownloader("")
		filename, err = downloader.Download(
			req.SpotifyID, trackDir, req.Quality, "title-artist", false, 0,
			req.TrackName, req.ArtistName, req.AlbumName, req.AlbumArtist,
			req.ReleaseDate, false, req.CoverURL, false,
			req.TrackNumber, req.DiscNumber, req.TotalTracks, req.TotalDiscs,
			"", "", spotifyURL, true, false, false, false,
		)

	case "qobuz":
		// Need ISRC for Qobuz
		songLinkClient := backend.NewSongLinkClient()
		isrc, _ := songLinkClient.GetISRC(req.SpotifyID)

		downloader := backend.NewQobuzDownloader()
		quality := req.Quality
		if quality == "" || quality == "LOSSLESS" {
			quality = "27" // Hi-Res
		}
		filename, err = downloader.DownloadTrackWithISRC(
			isrc, req.SpotifyID, trackDir, quality, "title-artist", false, 0,
			req.TrackName, req.ArtistName, req.AlbumName, req.AlbumArtist,
			req.ReleaseDate, false, req.CoverURL, false,
			req.TrackNumber, req.DiscNumber, req.TotalTracks, req.TotalDiscs,
			"", "", spotifyURL, true, false, false, false,
		)

	default:
		jsonError(w, 400, fmt.Sprintf("Unsupported service: %s", req.Service))
		return
	}

	if err != nil {
		jsonError(w, 500, fmt.Sprintf("Download failed (%s): %v", req.Service, err))
		return
	}

	// Handle "EXISTS:" prefix
	if strings.HasPrefix(filename, "EXISTS:") {
		filename = strings.TrimPrefix(filename, "EXISTS:")
	}

	// Get file info
	fileInfo, statErr := os.Stat(filename)
	if statErr != nil {
		jsonError(w, 500, fmt.Sprintf("File not found after download: %v", statErr))
		return
	}

	// Determine format from extension
	ext := strings.ToLower(filepath.Ext(filename))
	format := strings.TrimPrefix(ext, ".")

	jsonResponse(w, 200, DownloadResponse{
		Success:  true,
		FilePath: filename,
		FileName: filepath.Base(filename),
		FileSize: fileInfo.Size(),
		Format:   format,
	})
}

// ─── Search ───

func handleSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		jsonError(w, 405, "Method not allowed")
		return
	}

	query := r.URL.Query().Get("q")
	if query == "" {
		jsonError(w, 400, "Missing 'q' parameter")
		return
	}

	limit := 10
	if l := r.URL.Query().Get("limit"); l != "" {
		fmt.Sscanf(l, "%d", &limit)
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	results, err := backend.SearchSpotify(ctx, query, limit)
	if err != nil {
		jsonError(w, 500, fmt.Sprintf("Search failed: %v", err))
		return
	}

	jsonResponse(w, 200, results)
}

// ─── Helpers ───

func extractSpotifyID(url string) string {
	// Handle spotify:track:ID format
	if strings.HasPrefix(url, "spotify:track:") {
		return strings.TrimPrefix(url, "spotify:track:")
	}

	// Handle https://open.spotify.com/track/ID?...
	parts := strings.Split(url, "/track/")
	if len(parts) < 2 {
		return ""
	}
	id := parts[1]
	if idx := strings.Index(id, "?"); idx >= 0 {
		id = id[:idx]
	}
	return strings.TrimSpace(id)
}
