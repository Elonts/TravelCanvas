"""Optional Scrapling helper: public pages only, bounded JSON stdin/stdout."""
import json
import sys
from urllib.parse import urlparse


def allowed(value: str) -> bool:
    try:
        parsed = urlparse(value)
        return parsed.scheme == "https" and parsed.hostname in {"www.xiaohongshu.com", "xiaohongshu.com"} and not parsed.username and not parsed.port
    except ValueError:
        return False


def main() -> None:
    try:
        from scrapling.fetchers import Fetcher
        urls = [value for value in json.load(sys.stdin)[:80] if isinstance(value, str) and allowed(value)]
    except Exception:
        print("[]")
        return
    rows = []
    for url in urls:
        try:
            page = Fetcher.get(url, timeout=10)
            parts = page.css("body :not(script):not(style):not(noscript)::text").getall()
            content = " ".join(part.strip() for part in parts if isinstance(part, str) and part.strip())
            if content and len(content) >= 80:
                rows.append({"url": url, "content": content[:50000]})
        except Exception:
            continue
    print(json.dumps(rows, ensure_ascii=False))


if __name__ == "__main__":
    main()
