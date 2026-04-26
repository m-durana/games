"""Shared loaders for the routes data pipeline."""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AIRPORTS_PATH = os.path.join(ROOT, "src", "data", "airports.json")
AIRLINES_PATH = os.path.join(ROOT, "src", "data", "airlines.json")
PIPE_DIR = os.path.dirname(os.path.abspath(__file__))


def load_airports():
    with open(AIRPORTS_PATH) as f:
        return json.load(f)  # dict iata -> name


def load_airlines():
    with open(AIRLINES_PATH) as f:
        return json.load(f)  # list of dicts


def airline_iatas():
    return {a["iata"] for a in load_airlines() if a.get("iata")}


def airline_hubs():
    return {a["iata"]: a.get("hub") for a in load_airlines() if a.get("iata")}


def airport_iatas():
    return set(load_airports().keys())


def topn(counter, n=5, exclude=None):
    """Return top-n keys from {key: count} dict, descending, optionally excluding a set/iterable."""
    exc = set(exclude) if exclude else set()
    items = [(k, v) for k, v in counter.items() if k not in exc and v > 0]
    items.sort(key=lambda kv: (-kv[1], kv[0]))
    return [k for k, _ in items[:n]]


def write_partial(name, data):
    path = os.path.join(PIPE_DIR, name)
    with open(path, "w") as f:
        json.dump(data, f, indent=2, sort_keys=True)
    print(f"wrote {path} (airports={len(data.get('airports', {}))}, airlines={len(data.get('airlines', {}))})")
    return path
