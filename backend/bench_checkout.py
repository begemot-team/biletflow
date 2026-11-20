"""Measure checkout latency and check overselling against the running HTTP API.

Two runs, both on their own free event (paid sales need activation, which this
script does not exercise):

1. Sequential: each buyer reserves one ticket (POST /orders) and pays for it
   (POST /orders/:id/checkout). Reports p50/p95/max for each step and both together.
2. Contention: more parallel checkouts than tickets, all at once. Exactly `stock`
   orders may succeed; every other one must get a clean refusal, and the event must
   never issue more tickets than it has. Requests are spread over a few accounts
   because registration is rate limited (60/min).

Run it against gunicorn (as on Heroku), not `runserver`: the dev server drops
connections under the parallel run.
"""

import argparse
import json
import secrets
import statistics
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError
from urllib.request import Request, urlopen

# The SRS sets no checkout figure; reuse the 2 s it sets for check-in as the bar.
TARGET_SECONDS = 2.0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000/api")
    parser.add_argument("--orders", type=int, default=100, help="sequential checkouts")
    parser.add_argument("--stock", type=int, default=10, help="tickets in the contention run")
    parser.add_argument("--rush", type=int, default=40, help="parallel checkouts (contention run)")
    parser.add_argument("--accounts", type=int, default=8, help="buyer accounts behind the rush")
    args = parser.parse_args()
    base = args.base_url.rstrip("/")

    def call(path, data=None, token=None, expected=(200,)):
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = "Bearer " + token
        request = Request(
            base + path,
            data=json.dumps(data).encode() if data is not None else None,
            headers=headers,
        )
        started = time.perf_counter()
        try:
            with urlopen(request, timeout=30) as response:
                status, body = response.status, response.read()
        except HTTPError as exc:
            status, body = exc.code, exc.read()
        elapsed = time.perf_counter() - started
        if status not in expected:
            raise RuntimeError(f"{path}: expected {expected}, received {status}: {body.decode()}")
        return status, (json.loads(body) if body else None), elapsed

    suffix = secrets.token_hex(6)
    password = secrets.token_urlsafe(24)

    def account(role, label):
        email = f"bench-{label}-{suffix}@example.com"
        data = {"email": email, "password": password, "account_type": role}
        if role == "organizer":
            data["organizer_profile"] = {"display_name": "Bench organizer", "contact_email": email}
        call("/auth/register", data, expected=(201,))
        return call("/auth/login", {"email": email, "password": password})[1]["access"]

    owner = account("organizer", "owner")

    def free_event(title, quantity):
        start = datetime.now(timezone.utc) + timedelta(days=7)
        event = call(
            "/events",
            {
                "title": f"{title} {suffix}",
                "venue": "Almaty",
                "starts_at": start.isoformat(),
                "ends_at": (start + timedelta(hours=2)).isoformat(),
                "capacity": quantity,
            },
            owner,
            (201,),
        )[1]["id"]
        kind = call(
            f"/events/{event}/ticket-types",
            {"name": "Entry", "price_minor": 0, "quantity": quantity, "max_per_order": 10},
            owner,
            (201,),
        )[1]["id"]
        call(f"/events/{event}/publish", {"published": True}, owner)
        return event, kind

    def summary(samples):
        ordered = sorted(samples)
        p95 = ordered[max(0, round(len(ordered) * 0.95) - 1)]
        return {
            "p50_ms": round(statistics.median(ordered) * 1000, 1),
            "p95_ms": round(p95 * 1000, 1),
            "max_ms": round(ordered[-1] * 1000, 1),
        }

    # 1. Sequential latency. One buyer, one ticket per order, like the web checkout.
    buyer = account("attendee", "buyer")
    event, kind = free_event("Checkout benchmark", args.orders)
    reserve, pay = [], []
    for _ in range(args.orders):
        _, order, elapsed = call(
            "/orders",
            {"event": event, "items": [{"ticket_type": kind, "quantity": 1}]},
            buyer,
            (201,),
        )
        reserve.append(elapsed)
        _, paid, elapsed = call(f"/orders/{order['id']}/checkout", {"outcome": "success"}, buyer)
        assert paid["status"] == "confirmed" and len(paid["tickets"]) == 1, paid
        pay.append(elapsed)
    both = [r + p for r, p in zip(reserve, pay, strict=True)]

    # 2. Contention: more parallel checkouts than stock, all at once.
    event, kind = free_event("Checkout contention", args.stock)
    pool_accounts = [account("attendee", f"rush{i}") for i in range(args.accounts)]
    buyers = [pool_accounts[i % args.accounts] for i in range(args.rush)]

    def rush(token):
        status, order, _ = call(
            "/orders",
            {"event": event, "items": [{"ticket_type": kind, "quantity": 1}]},
            token,
            (201, 400, 409),
        )
        if status != 201:
            return "refused"
        status, paid, _ = call(
            f"/orders/{order['id']}/checkout", {"outcome": "success"}, token, (200, 400, 409)
        )
        return "paid" if status == 200 and paid["status"] == "confirmed" else "refused"

    with ThreadPoolExecutor(max_workers=args.rush) as pool:
        outcomes = list(pool.map(rush, buyers))
    attendees = call(f"/events/{event}/attendees", token=owner)[1]
    issued = attendees["count"] if isinstance(attendees, dict) else len(attendees)

    report = {
        "sequential_orders": args.orders,
        "reserve": summary(reserve),
        "checkout": summary(pay),
        "reserve_plus_checkout": summary(both),
        "target_ms": TARGET_SECONDS * 1000,
        "within_target": max(both) < TARGET_SECONDS,
        "contention": {
            "stock": args.stock,
            "parallel_checkouts": args.rush,
            "paid": outcomes.count("paid"),
            "refused": outcomes.count("refused"),
            "tickets_issued": issued,
            "oversold": issued > args.stock,
        },
    }
    print(json.dumps(report, indent=2))
    if report["contention"]["oversold"] or report["contention"]["paid"] != args.stock:
        raise SystemExit("Contention run sold a different number of tickets than in stock.")
    if not report["within_target"]:
        raise SystemExit("Checkout latency exceeded the target.")


if __name__ == "__main__":
    main()
