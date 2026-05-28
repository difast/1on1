import time

_cache: dict[int, float] = {}
THRESHOLD = 180  # 3 minutes

def ping(user_id: int):
    _cache[user_id] = time.time()

def is_online(user_id: int) -> bool:
    last = _cache.get(user_id)
    return last is not None and (time.time() - last) < THRESHOLD
