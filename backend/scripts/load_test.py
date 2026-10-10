"""A small, dependency-free load test: N concurrent users each make M requests to a few endpoints and the script prints
throughput, error rate and latency percentiles.

    python scripts/load_test.py --base http://localhost:8000 --users 20 --requests 10 --slug demo-academy

Run it against a staging copy, never production, and never with credentials for a real account: it only calls public
endpoints (health, a school's public branding, the public maintenance notice, the SPA shell). It measures the whole
stack the way a visitor would see it; watch the database's own dashboard for connections/CPU while it runs."""

import argparse
import statistics
import threading
import time
import urllib.error
import urllib.request


def hit(url: str) -> tuple[bool, float, int]:
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(url, timeout=60) as response:
            response.read()
            return 200 <= response.status < 400, time.perf_counter() - started, response.status
    except urllib.error.HTTPError as exc:
        return False, time.perf_counter() - started, exc.code
    except Exception:  # noqa: BLE001 - a network failure counts as an error, status 0
        return False, time.perf_counter() - started, 0


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://localhost:8000")
    parser.add_argument("--users", type=int, default=20)
    parser.add_argument("--requests", type=int, default=10)
    parser.add_argument("--slug", default="demo-academy")
    args = parser.parse_args()

    endpoints = [
        f"{args.base}/api/v1/health/",
        f"{args.base}/api/v1/schools/branding/{args.slug}/",
        f"{args.base}/api/v1/platform/maintenance/",
        f"{args.base}/{args.slug}/login",
    ]
    results: list[tuple[str, bool, float, int]] = []
    lock = threading.Lock()

    def user(index: int) -> None:
        for n in range(args.requests):
            url = endpoints[(index + n) % len(endpoints)]
            ok, seconds, code = hit(url)
            with lock:
                results.append((url, ok, seconds, code))

    started = time.perf_counter()
    threads = [threading.Thread(target=user, args=(i,)) for i in range(args.users)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    elapsed = time.perf_counter() - started

    total = len(results)
    errors = sum(1 for r in results if not r[1])
    print(f"{total} requests by {args.users} concurrent users in {elapsed:.1f}s  ->  {total / elapsed:.1f} req/s, {errors} errors ({100 * errors / total:.1f}%)")
    for url in endpoints:
        times = sorted(r[2] for r in results if r[0] == url)
        if not times:
            continue
        codes = sorted({r[3] for r in results if r[0] == url})
        p95 = times[min(len(times) - 1, int(len(times) * 0.95))]
        print(f"  {url.replace(args.base, ''):55s} n={len(times):4d}  median {statistics.median(times) * 1000:7.0f} ms  p95 {p95 * 1000:7.0f} ms  max {times[-1] * 1000:7.0f} ms  status {codes}")


if __name__ == "__main__":
    main()
