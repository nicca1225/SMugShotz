import os
import re
import json
import statistics
import requests
from flask import Flask, request, jsonify

app = Flask(__name__)

CACHE_FILE = 'prices.json'
SERPAPI_KEY = os.environ.get('SERPAPI_KEY', '')

def normalize_camera_key(brand, model):
    """Normalize brand and model keys for consistent cache lookup."""
    combined = f"{brand} {model}"
    # Replace multiple consecutive spaces with a single space, strip whitespace, and convert to lowercase
    normalized = re.sub(r'\s+', ' ', combined).strip().lower()
    return normalized

def validate_input(data):
    """Validate incoming JSON input. Returns (is_valid, parsed_data, errors)."""
    errors = []
    parsed = {}
    
    if not isinstance(data, dict):
        return False, {}, ["Invalid or missing JSON payload."]
        
    brand = data.get('brand')
    model = data.get('model')
    
    if not isinstance(brand, str) or not brand.strip():
        errors.append("brand cannot be blank")
    else:
        parsed['brand'] = brand.strip()
        
    if not isinstance(model, str) or not model.strip():
        errors.append("model cannot be blank")
    else:
        parsed['model'] = model.strip()
        
    try:
        shutter_count = data.get('shutter_count')
        if shutter_count is None:
            raise ValueError
        shutter_count_int = int(shutter_count)
        if shutter_count_int < 0:
            errors.append("shutter_count cannot be negative")
        else:
            parsed['shutter_count'] = shutter_count_int
    except (ValueError, TypeError):
        errors.append("shutter_count must be an integer")
        
    try:
        condition_score = data.get('condition_score')
        if condition_score is None:
            raise ValueError
        condition_score_float = float(condition_score)
        if not (0 <= condition_score_float <= 10):
            errors.append("condition_score must be between 0 and 10")
        else:
            parsed['condition_score'] = condition_score_float
    except (ValueError, TypeError):
        errors.append("condition_score must be numeric")
        
    return len(errors) == 0, parsed, errors

def load_cached_prices():
    """Load fallback prices from a local JSON file."""
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, 'r') as f:
            try:
                raw_data = json.load(f)
                # Ensure all loaded keys are appropriately normalized (safeguard for legacy files)
                normalized_cache = {}
                for k, v in raw_data.items():
                    norm_k = re.sub(r'\s+', ' ', k).strip().lower()
                    normalized_cache[norm_k] = v
                return normalized_cache
            except json.JSONDecodeError:
                return {}
    return {}

def save_cached_prices(cache):
    """Save the updated prices cache to the local JSON file."""
    with open(CACHE_FILE, 'w') as f:
        json.dump(cache, f, indent=2)

def fetch_serpapi_prices(brand, model):
    """
    Fetch comparable sold camera listing prices from eBay via SerpAPI.
    """
    prices = []
    if not SERPAPI_KEY:
        print("SERPAPI_KEY not set, skipping SerpAPI fetch.")
        return prices

    params = {
        'engine': 'ebay',
        '_nkw': f"{brand} {model} used",
        'filters': 'Sold',
        '_ipg': '25',
        'api_key': SERPAPI_KEY
    }

    try:
        response = requests.get('https://serpapi.com/search.json', params=params, timeout=10)
        if response.status_code == 200:
            data = response.json()
            for item in data.get('organic_results', []):
                price = item.get('price', {})
                extracted = price.get('extracted')
                if extracted is not None:
                    try:
                        prices.append(round(float(extracted), 2))
                    except (ValueError, TypeError):
                        continue
    except requests.RequestException as e:
        print(f"SerpAPI network error: {e}")
    except Exception as e:
        print(f"SerpAPI parsing error: {e}")

    return prices

def remove_outliers(prices):
    """Remove obvious outliers from a list of prices using IQR."""
    if not prices or len(prices) < 3:
        return prices
        
    prices_sorted = sorted(prices)
    n = len(prices_sorted)
    
    q1 = statistics.median(prices_sorted[:n//2])
    q3 = statistics.median(prices_sorted[(n+1)//2:])
    iqr = q3 - q1
    
    lower_bound = q1 - 1.5 * iqr
    upper_bound = q3 + 1.5 * iqr
    
    filtered = [p for p in prices if lower_bound <= p <= upper_bound]
    return filtered

def calculate_suggested_price(base_price, shutter_count, condition_score):
    """Calculate the final suggested price based on base median and condition rules."""
    if shutter_count > 50000:
        base_price -= 200
    elif shutter_count > 20000:
        base_price -= 100
        
    if condition_score >= 8:
        base_price += 50
    elif condition_score < 5:
        base_price -= 100
        
    return max(100.0, base_price)

@app.route('/predict-price', methods=['POST'])
def predict_price():
    data = request.get_json(silent=True) or {}
    
    # 1. Validate Input
    is_valid, parsed, errors = validate_input(data)
    if not is_valid:
        return jsonify({
            "code": 400,
            "message": "Invalid input data.",
            "errors": errors
        }), 400
        
    brand = parsed['brand']
    model = parsed['model']
    shutter_count = parsed['shutter_count']
    condition_score = parsed['condition_score']
    
    # 2. Normalize Key for Cache Interactions
    camera_key = normalize_camera_key(brand, model)
    
    # 3. Fetch prices from eBay via SerpAPI
    scraped_prices = fetch_serpapi_prices(brand, model)

    number_of_prices_used = 0
    price_source = ""
    comparable_prices = []

    if len(scraped_prices) >= 3:
        # We got enough data from live scraping
        price_source = "scraped"
        comparable_prices = scraped_prices
        
        filtered = remove_outliers(comparable_prices)
        if not filtered:
            filtered = comparable_prices
            
        median_val = round(statistics.median(filtered), 2)
        
        # Store the derived median in the json cache representing this successful fetch
        cache = load_cached_prices()
        cache[camera_key] = [median_val]
        save_cached_prices(cache)
        
        number_of_prices_used = len(filtered)
        base_price = median_val
        
    else:
        # 4. Scraper returned < 3 valid prices, Fallback to cache safely
        cache = load_cached_prices()
        cached_prices = cache.get(camera_key, [])
        
        if len(cached_prices) >= 1:
            price_source = "cache"
            comparable_prices = cached_prices
            
            filtered = remove_outliers(comparable_prices)
            if not filtered:
                filtered = comparable_prices
                
            base_price = round(statistics.median(filtered), 2)
            number_of_prices_used = len(filtered)
        else:
            return jsonify({
                "code": 404,
                "message": "Not enough data available to calculate a price."
            }), 404

    # 5. Apply Adjustments
    suggested_price = calculate_suggested_price(base_price, shutter_count, condition_score)
    
    return jsonify({
        "code": 200,
        "message": "Price predicted successfully.",
        "data": {
            "suggested_price": round(suggested_price, 2),
            "price_source": price_source,
            "number_of_prices_used": number_of_prices_used
        }
    })

if __name__ == '__main__':
    # Flask runtime cleanup (removed debug=True)
    app.run(host='0.0.0.0', port=5000)
