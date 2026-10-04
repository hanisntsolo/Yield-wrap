"""Small in-process sliding-window limiter (used to slow down password guessing)."""
import time
from collections import defaultdict, deque

from errors import APIError


class RateLimiter:
    def __init__(self, max_attempts: int, window_seconds: float) -> None:
        self.max_attempts = max_attempts
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] > self.window:
            hits.popleft()
        if len(hits) >= self.max_attempts:
            retry = int(self.window - (now - hits[0])) + 1
            raise APIError(429, f"Too many attempts. Try again in {retry} seconds.", "RATE_LIMITED")
        hits.append(now)

    def reset(self, key: str) -> None:
        self._hits.pop(key, None)


login_limiter = RateLimiter(max_attempts=10, window_seconds=15 * 60)
