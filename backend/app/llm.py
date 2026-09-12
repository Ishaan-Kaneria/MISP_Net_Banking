try:
    import httpx
except ImportError:  # Local fallback remains available before optional client install.
    httpx = None

from .config import settings


def generate_reply_with_status(message: str, language: str, policy_context: str, stress_flag: bool) -> tuple[str | None, str]:
    if not settings.gemini_api_key or httpx is None:
        return None, "missing_key" if not settings.gemini_api_key else "httpx_unavailable"
    safety = "Do not recommend credit. Offer grace-period support only." if stress_flag else "Apply the product ethics rules before discussing credit."
    prompt = (
        "You are Arth-AI, a careful Indian banking assistant. Answer only from the policy context and the user's verified account tools. "
        f"Reply in {language}. {safety}\n\nPolicy context:\n{policy_context}\n\nUser: {message}"
    )
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.llm_model}:generateContent"
    try:
        response = httpx.post(url, params={"key": settings.gemini_api_key}, json={"contents": [{"parts": [{"text": prompt}]}]}, timeout=12)
        response.raise_for_status()
        parts = response.json().get("candidates", [{}])[0].get("content", {}).get("parts", [])
        reply = "".join(part.get("text", "") for part in parts).strip()
        return (reply, "gemini") if reply else (None, "empty_response")
    except httpx.HTTPStatusError as error:
        return None, f"http_error_{error.response.status_code}"
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError):
        return None, "request_error"


def generate_reply(message: str, language: str, policy_context: str, stress_flag: bool) -> str | None:
    reply, _ = generate_reply_with_status(message, language, policy_context, stress_flag)
    return reply