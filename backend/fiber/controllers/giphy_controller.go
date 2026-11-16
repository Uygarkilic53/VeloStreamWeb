package controllers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/velostream/fiber/models"
)

type cachedGiphyEntry struct {
	response  models.GiphyResponse
	expiresAt time.Time
}

type GiphyController struct {
	apiKey     string
	httpClient *http.Client
	cacheMu    sync.RWMutex
	cache      map[string]cachedGiphyEntry
}

func NewGiphyController(apiKey string) *GiphyController {
	if apiKey == "" {
		apiKey = "igSzLjA7q9mSr0QNgANOc6w6AqGOdqxt"
	}
	return &GiphyController{
		apiKey: apiKey,
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
		cache: make(map[string]cachedGiphyEntry),
	}
}

type giphyRawResponse struct {
	Data []struct {
		ID     string `json:"id"`
		Title  string `json:"title"`
		Images struct {
			FixedWidth struct {
				URL    string `json:"url"`
				Width  string `json:"width"`
				Height string `json:"height"`
			} `json:"fixed_width"`
			Original struct {
				URL    string `json:"url"`
				Width  string `json:"width"`
				Height string `json:"height"`
			} `json:"original"`
		} `json:"images"`
	} `json:"data"`
	Pagination struct {
		TotalCount int `json:"total_count"`
		Count      int `json:"count"`
		Offset     int `json:"offset"`
	} `json:"pagination"`
}

func (c *GiphyController) getFromCache(key string) (models.GiphyResponse, bool) {
	c.cacheMu.RLock()
	defer c.cacheMu.RUnlock()
	entry, ok := c.cache[key]
	if !ok || time.Now().After(entry.expiresAt) {
		return models.GiphyResponse{}, false
	}
	return entry.response, true
}

func (c *GiphyController) setCache(key string, res models.GiphyResponse, ttl time.Duration) {
	c.cacheMu.Lock()
	defer c.cacheMu.Unlock()
	c.cache[key] = cachedGiphyEntry{
		response:  res,
		expiresAt: time.Now().Add(ttl),
	}
}

// Trending handles GET /api/gifs/trending
func (c *GiphyController) Trending(ctx *fiber.Ctx) error {
	limit := ctx.QueryInt("limit", 24)
	if limit < 1 || limit > 50 {
		limit = 24
	}
	offset := ctx.QueryInt("offset", 0)
	if offset < 0 {
		offset = 0
	}
	rating := ctx.Query("rating", "g")

	cacheKey := fmt.Sprintf("trending:%d:%d:%s", limit, offset, rating)
	if cached, ok := c.getFromCache(cacheKey); ok {
		return ctx.JSON(cached)
	}

	endpoint := fmt.Sprintf(
		"https://api.giphy.com/v1/gifs/trending?api_key=%s&limit=%d&offset=%d&rating=%s",
		url.QueryEscape(c.apiKey),
		limit,
		offset,
		url.QueryEscape(rating),
	)

	res, err := c.fetchFromGiphy(endpoint)
	if err != nil {
		return ctx.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error":   "GIPHY_API_ERROR",
			"message": "Unable to fetch trending GIFs from GIPHY service.",
		})
	}

	c.setCache(cacheKey, res, 5*time.Minute)
	return ctx.JSON(res)
}

// Search handles GET /api/gifs/search
func (c *GiphyController) Search(ctx *fiber.Ctx) error {
	query := ctx.Query("q", "")
	if query == "" {
		return c.Trending(ctx)
	}
	limit := ctx.QueryInt("limit", 24)
	if limit < 1 || limit > 50 {
		limit = 24
	}
	offset := ctx.QueryInt("offset", 0)
	if offset < 0 {
		offset = 0
	}
	rating := ctx.Query("rating", "g")

	cacheKey := fmt.Sprintf("search:%s:%d:%d:%s", query, limit, offset, rating)
	if cached, ok := c.getFromCache(cacheKey); ok {
		return ctx.JSON(cached)
	}

	endpoint := fmt.Sprintf(
		"https://api.giphy.com/v1/gifs/search?api_key=%s&q=%s&limit=%d&offset=%d&rating=%s",
		url.QueryEscape(c.apiKey),
		url.QueryEscape(query),
		limit,
		offset,
		url.QueryEscape(rating),
	)

	res, err := c.fetchFromGiphy(endpoint)
	if err != nil {
		return ctx.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error":   "GIPHY_API_ERROR",
			"message": "Unable to search GIFs from GIPHY service.",
		})
	}

	c.setCache(cacheKey, res, 2*time.Minute)
	return ctx.JSON(res)
}

func (c *GiphyController) fetchFromGiphy(endpoint string) (models.GiphyResponse, error) {
	req, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		return models.GiphyResponse{}, err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return models.GiphyResponse{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return models.GiphyResponse{}, fmt.Errorf("giphy returned HTTP %d", resp.StatusCode)
	}

	var raw giphyRawResponse
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return models.GiphyResponse{}, err
	}

	gifs := make([]models.GiphyGifItem, 0, len(raw.Data))
	for _, item := range raw.Data {
		w, _ := strconv.Atoi(item.Images.FixedWidth.Width)
		h, _ := strconv.Atoi(item.Images.FixedWidth.Height)
		previewURL := item.Images.FixedWidth.URL
		if previewURL == "" {
			previewURL = item.Images.Original.URL
		}
		gifs = append(gifs, models.GiphyGifItem{
			ID:          item.ID,
			Title:       item.Title,
			PreviewURL:  previewURL,
			OriginalURL: item.Images.Original.URL,
			Width:       w,
			Height:      h,
		})
	}

	return models.GiphyResponse{
		Gifs: gifs,
		Pagination: models.GiphyPagination{
			TotalCount: raw.Pagination.TotalCount,
			Count:      raw.Pagination.Count,
			Offset:     raw.Pagination.Offset,
		},
	}, nil
}
