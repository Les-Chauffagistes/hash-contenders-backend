#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import json
import os
import random
import time
from dataclasses import dataclass
from typing import Dict, List, Optional

import requests

TIP_URL = "https://mempool.space/api/blocks/tip/height"
HEX = "0123456789abcdef"


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def now_createdate() -> str:
    t = time.time()
    sec = int(t)
    frac = int((t - sec) * 1_000_000_000)
    return f"{sec},{frac:09d}"


def rand_hex(n: int) -> str:
    return "".join(random.choice(HEX) for _ in range(n))


def get_tip_height(timeout: int) -> int:
    r = requests.get(TIP_URL, timeout=timeout)
    r.raise_for_status()
    return int(r.text.strip())


def round_dir_from_height(base_dir: str, height: int) -> str:
    return os.path.join(base_dir, f"{height:08x}")


def sharelog_filename(prefix8: str, counter: int) -> str:
    return f"{prefix8}{counter:08x}.sharelog"


# Agent => vardiff
AGENTS: Dict[str, Dict[str, float]] = {
    "bitaxe/BM1370/v2.12.2": {"diff": 1000.0, "accept_rate": 0.70},
    "bitaxe/BM1370/v2.12.0": {"diff": 1000.0, "accept_rate": 0.70},
    "bitaxe/BM1368/v1.0.7": {"diff": 512.0,  "accept_rate": 0.65},
    "bitaxe/BM1397/v2.12.0": {"diff": 1000.0, "accept_rate": 0.70},
    "cgminer/4.11.1":       {"diff": 6345.0, "accept_rate": 0.75},
    "whatsminer/v1.0":      {"diff": 43027.0, "accept_rate": 0.80},
    "NMAxe/v2.5.10":        {"diff": 200.0,  "accept_rate": 0.55},
    "NerdQAxe++/BM1370/v1.0.35": {"diff": 5072.0, "accept_rate": 0.60},
}

NONCE2_CHOICES = [
    "1d00000000000000", "1b00000000000000", "1e00000000000000", "1c00000000000000",
    "6302000000000000", "f228000000000000", "683d000000000000", "7102000000000000",
    "ef0c000000000000", "6802000000000000", "bc39000000000000", "a93b000000000000",
]


def random_ipv4() -> str:
    return ".".join(str(random.randint(1, 254)) for _ in range(4))


def random_btc_address() -> str:
    # “look-like” bech32
    return "bc1q" + "".join(random.choice("abcdefghijklmnopqrstuvwxyz0123456789") for _ in range(50))


def random_worker() -> str:
    base = random.choice([
        "timixx", "Alan", "Snafus", "Montagnole", "eufo", "BRM1", "binuts",
        "Durdur33", "heimrichdab", "Brucewayne", "Meier_Link", "nanoJ", "bitaxe",
        "worker", "NerdQaxe", "MoghRoith13"
    ])
    if random.random() < 0.25:
        return f"{base}{random.randint(2, 9)}"
    return base


@dataclass(frozen=True)
class Connection:
    clientid: int
    ip_address: str   # champ "address" dans le sharelog (IP mineur)
    btc_address: str  # adresse BTC (ton "user réel")
    worker: str       # suffixe (ton "worker name")
    workername: str   # "{btc_address}.{worker}"
    agent: str


def make_connections(
    n_users_ip: int,
    min_btc_per_ip: int,
    max_btc_per_ip: int,
    min_workers_per_btc: int,
    max_workers_per_btc: int,
    min_agents_per_pair: int,
    max_agents_per_pair: int,
    clientid_start: int,
) -> List[Connection]:
    conns: List[Connection] = []
    clientid = clientid_start
    agent_keys = list(AGENTS.keys())

    for _ in range(n_users_ip):
        ip = random_ipv4()

        btc_count = random.randint(min_btc_per_ip, max_btc_per_ip)
        btc_addresses = [random_btc_address() for _ in range(btc_count)]

        for btc in btc_addresses:
            worker_count = random.randint(min_workers_per_btc, max_workers_per_btc)
            workers: List[str] = []
            used = set()
            for _w in range(worker_count):
                w = random_worker()
                tries = 0
                while w in used and tries < 10:
                    w = random_worker()
                    tries += 1
                used.add(w)
                workers.append(w)

            for w in workers:
                # (ip, btc, worker) peut avoir plusieurs agents => plusieurs clientid
                agent_count = random.randint(min_agents_per_pair, max_agents_per_pair)
                agents = random.sample(agent_keys, k=min(agent_count, len(agent_keys)))

                for agent in agents:
                    workername = f"{btc}.{w}"
                    conns.append(Connection(
                        clientid=clientid,
                        ip_address=ip,
                        btc_address=btc,
                        worker=w,
                        workername=workername,
                        agent=agent,
                    ))
                    clientid += 1

    return conns


def mk_share(conn: Connection, fixed_ntime: Optional[str], workinfoid_bits: int) -> dict:
    conf = AGENTS.get(conn.agent, {"diff": 1000.0, "accept_rate": 0.7})
    diff = float(conf["diff"])
    accept_rate = float(conf["accept_rate"])

    accepted = (random.random() < accept_rate)
    sdiff = diff * random.uniform(1.05, 25.0)  # toujours > diff
    workinfoid = random.getrandbits(workinfoid_bits)

    ntime = fixed_ntime if fixed_ntime else rand_hex(8)

    base = {
        "workinfoid": workinfoid,
        "clientid": conn.clientid,
        "enonce1": rand_hex(8),
        "nonce2": random.choice(NONCE2_CHOICES),
        "nonce": rand_hex(8),
        "ntime": ntime,
        "diff": diff,
        "sdiff": float(sdiff),
        "hash": "0000000000" + rand_hex(54),
        "result": bool(accepted),
        "errn": 0 if accepted else 2,
        "createdate": now_createdate(),
        "createby": "code",
        "createcode": "parse_submit",
        "createinet": "0.0.0.0:3333",

        # ✅ MATCH TON WS :
        # - o.username = adresse BTC (param "address" côté WS)
        # - o.workername = "adresseBTC.worker" (param "worker" => suffixe)
        "workername": conn.workername,   # "btc.worker"
        "username": conn.btc_address,    # adresse BTC (user réel)

        # logs ckpool: "address" = IP du mineur
        "address": conn.ip_address,
        "agent": conn.agent,
    }
    if not accepted:
        base["reject-reason"] = "Stale"
    return base


def main() -> int:
    p = argparse.ArgumentParser(
        description="Simule sharelogs ckpool-like: ~3-4 shares/s, 1 fichier/min, round = tip+1, username=btc_address, worker=suffix dans workername"
    )
    p.add_argument("--base-dir", default="./ckpool/logs")
    p.add_argument("--poll-seconds", type=int, default=5)
    p.add_argument("--http-timeout", type=int, default=10)
    p.add_argument("--shares-per-sec", type=float, default=3.5)
    p.add_argument("--sharelog-interval-seconds", type=int, default=60)
    p.add_argument("--users-ip", type=int, default=60, help="Nb de users reels (IP distinctes)")

    p.add_argument("--min-btc-per-ip", type=int, default=1)
    p.add_argument("--max-btc-per-ip", type=int, default=3)

    # renommé: workers au lieu de usernames
    p.add_argument("--min-workers-per-btc", type=int, default=1)
    p.add_argument("--max-workers-per-btc", type=int, default=3)

    p.add_argument("--min-agents-per-pair", type=int, default=1, help="agents par (ip, btc, worker)")
    p.add_argument("--max-agents-per-pair", type=int, default=2)

    p.add_argument("--clientid-start", type=int, default=564466077000000)
    p.add_argument("--fixed-ntime", default=None)
    p.add_argument("--workinfoid-bits", type=int, default=63)
    args = p.parse_args()

    fixed_ntime: Optional[str] = None
    if args.fixed_ntime is not None:
        ft = args.fixed_ntime.strip().lower()
        if ft:
            if len(ft) != 8 or any(c not in HEX for c in ft):
                print("ERROR: --fixed-ntime doit etre 8 hex (ex: 6968c772)")
                return 2
            fixed_ntime = ft

    conns = make_connections(
        n_users_ip=args.users_ip,
        min_btc_per_ip=args.min_btc_per_ip,
        max_btc_per_ip=args.max_btc_per_ip,
        min_workers_per_btc=args.min_workers_per_btc,
        max_workers_per_btc=args.max_workers_per_btc,
        min_agents_per_pair=args.min_agents_per_pair,
        max_agents_per_pair=args.max_agents_per_pair,
        clientid_start=args.clientid_start,
    )

    print(f"[start] base-dir={args.base_dir} shares/s~{args.shares_per_sec} sharelog_every={args.sharelog_interval_seconds}s conns={len(conns)} tip_api={TIP_URL}")
    period = 1.0 / max(0.1, args.shares_per_sec)
    next_share_at = time.time()

    last_tip: Optional[int] = None
    current_round_height: Optional[int] = None
    last_poll = 0.0

    file_counter = 0
    fh = None
    file_opened_at = 0.0

    try:
        while True:
            now = time.time()

            # Poll tip height
            if (now - last_poll) >= args.poll_seconds or last_tip is None:
                last_poll = now
                try:
                    tip = get_tip_height(timeout=args.http_timeout)
                except Exception as e:
                    print(f"[warn] tip height fetch failed: {e}")
                    tip = last_tip

                if tip is not None and tip != last_tip:
                    last_tip = tip
                    current_round_height = tip + 1
                    print(f"[new tip] tip={tip} => mining_round={current_round_height} (hex={current_round_height:08x})")
                elif tip is not None and current_round_height is None:
                    last_tip = tip
                    current_round_height = tip + 1
                    print(f"[init] tip={tip} => mining_round={current_round_height} (hex={current_round_height:08x})")

            if current_round_height is None:
                time.sleep(1)
                continue

            # Rotate sharelog file every minute
            if fh is None or (now - file_opened_at) >= args.sharelog_interval_seconds:
                if fh is not None:
                    fh.flush()
                    fh.close()

                rdir = round_dir_from_height(args.base_dir, current_round_height)
                ensure_dir(rdir)

                prefix8 = f"{int(time.time()):08x}"[-8:]
                fname = sharelog_filename(prefix8, file_counter)
                file_counter += 1
                fpath = os.path.join(rdir, fname)
                fh = open(fpath, "w", encoding="utf-8")
                file_opened_at = now
                print(f"[new sharelog] {fpath}")

            # Rate limit shares
            if now < next_share_at:
                time.sleep(min(0.05, next_share_at - now))
                continue

            next_share_at += period

            conn = random.choice(conns)
            share = mk_share(conn, fixed_ntime=fixed_ntime, workinfoid_bits=args.workinfoid_bits)
            fh.write(json.dumps(share, ensure_ascii=False) + "\n")

    finally:
        if fh is not None:
            try:
                fh.flush()
                fh.close()
            except Exception:
                pass

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
