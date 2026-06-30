import io
import base64
try:
    from PIL import Image
    import piexif
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

import pytesseract
import requests

MALLCHAIN_REST = 'http://localhost:1317'

SCREENSHOT_HASH_STORE = {}

def _fetch_ocr_keywords():
    try:
        res = requests.get(f"{MALLCHAIN_REST}/marketplace/mallpoints/v1/ocr-keywords", timeout=5)
        if res.ok:
            return res.json()
    except Exception:
        pass
    return None

def _fetch_validation_thresholds():
    try:
        res = requests.get(f"{MALLCHAIN_REST}/marketplace/mallpoints/v1/validation-thresholds", timeout=5)
        if res.ok:
            return res.json()
    except Exception:
        pass
    return None

def extract_metadata(image_base64):
    if not HAS_PIL:
        return {"format": "unknown", "width": 0, "height": 0, "file_size": 0}
    
    try:
        image_data = base64.b64decode(image_base64)
        image = Image.open(io.BytesIO(image_data))
        
        width, height = image.size
        file_size = len(image_data)
        img_format = image.format
        
        exif_data = {}
        try:
            exif_dict = piexif.load(image.info.get("exif", b""))
            exif_data["DateTimeOriginal"] = exif_dict.get("Exif", {}).get(36867, b"").decode("utf-8", errors="ignore").strip("\x00")
            exif_data["Make"] = exif_dict.get("0th", {}).get(271, b"").decode("utf-8", errors="ignore").strip("\x00")
            exif_data["Model"] = exif_dict.get("0th", {}).get(272, b"").decode("utf-8", errors="ignore").strip("\x00")
            exif_data["Software"] = exif_dict.get("0th", {}).get(305, b"").decode("utf-8", errors="ignore").strip("\x00")
        except Exception:
            pass
        
        return {
            "format": img_format,
            "width": width,
            "height": height,
            "file_size": file_size,
            "exif": exif_data,
        }
    except Exception as e:
        return {"error": str(e)}

def compute_phash(image_base64):
    if not HAS_PIL:
        return "0"
    
    try:
        image_data = base64.b64decode(image_base64)
        image = Image.open(io.BytesIO(image_data)).convert("L").resize((32, 32))
        
        pixels = list(image.getdata())
        avg = sum(pixels) / len(pixels)
        
        bits = [1 if p >= avg else 0 for p in pixels]
        phash = "".join(map(str, bits[:64]))
        return hex(int(phash, 2))[2:]
    except Exception:
        return "0"

PLATFORM_OCR_KEYWORDS = None

def _fetch_screenshot_flags():
    try:
        res = requests.get(f"{MALLCHAIN_REST}/marketplace/mallpoints/v1/screenshot-flags", timeout=5)
        if res.ok:
            return res.json().get("flags", [])
    except Exception:
        pass
    return ["screenshot", "android", "miui", "oneui", "coloros", "emui", "screencapture"]

def run_platform_validation(image_base64, platform, content_url):
    signals = {}
    metadata = extract_metadata(image_base64)
    
    thresholds = _fetch_validation_thresholds()
    min_file_size = thresholds.get("min_file_size", 50000) if thresholds else 50000
    screenshot_weight = thresholds.get("weights", {}).get("screenshot", 0.3) if thresholds else 0.3
    
    if metadata.get("file_size", 0) < min_file_size:
        signals["insufficient_detail"] = {"pass": False, "weight": 0.5}
    
    exif = metadata.get("exif", {})
    software = exif.get("Software", "").lower()
    screenshot_flags = _fetch_screenshot_flags()
    signals["is_screenshot"] = {"pass": any(f in software for f in screenshot_flags), "weight": screenshot_weight}
    
    try:
        image_data = base64.b64decode(image_base64)
        image = Image.open(io.BytesIO(image_data))
        ocr_text = pytesseract.image_to_string(image).lower()
        
        ocr_keywords = _fetch_ocr_keywords()
        if ocr_keywords is None:
            ocr_keywords = {
                "youtube": ["youtube", "youtubekids", "studio.youtube", "@", "subscribe"],
                "tiktok": ["tiktok", "tiktok.com", "@", "follow", "like"],
                "instagram": ["instagram", " instagram", "@", "like", "follow"],
                "x": ["twitter", "x.com", "tweet", "retweet"],
                "facebook": ["facebook", "fb.com", "like", "share", "comment"],
                "threads": ["threads", "threads.net"],
                "snapchat": ["snapchat", "snap"],
            }
        
        platform_keywords = ocr_keywords.get(platform, [])
        found_keywords = [kw for kw in platform_keywords if kw in ocr_text]
        signals["platform_detected"] = {"pass": len(found_keywords) >= 2, "keywords": found_keywords, "weight": 0.6}
        
        if content_url:
            url_parts = content_url.split("/")[-1][:10]
            signals["url_visible"] = {"pass": url_parts in ocr_text, "weight": 0.8}
    except Exception:
        signals["ocr_failed"] = {"pass": False, "weight": 0.5}
    
    total_weight = sum(s.get("weight", 0) for s in signals.values())
    failed_weight = sum(s.get("weight", 0) for s in signals.values() if not s.get("pass", True))
    
    confidence = (total_weight - failed_weight) / total_weight if total_weight > 0 else 0.5
    
    if confidence >= 0.7:
        decision = "AUTO_APPROVE"
    elif confidence >= 0.4:
        decision = "MANUAL_REVIEW"
    else:
        decision = "REJECT"
    
    return {"signals": signals, "confidence": confidence, "decision": decision}

def check_screenshot_reuse(image_base64, screenshot_hash=None):
    if screenshot_hash is None:
        screenshot_hash = compute_phash(image_base64)
    
    if screenshot_hash in SCREENSHOT_HASH_STORE:
        return {"reused": True, "original_campaign": SCREENSHOT_HASH_STORE[screenshot_hash]}
    
    return {"reused": False}

def register_screenshot(image_base64, campaign_id):
    phash = compute_phash(image_base64)
    SCREENSHOT_HASH_STORE[phash] = campaign_id
    return {"registered": True, "phash": phash}