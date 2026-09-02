#!/usr/bin/env python3
"""Seed the Employment Passport backend with demo data:
20 workers, 5 training centers, 3 companies — plus per-center trust weights and
one skill certificate per worker. Safe to re-run after a backend restart.

Usage:  python3 demo-seed.py   (backend must be running on :8080)
"""
import json
import urllib.request

BASE = "http://localhost:8080"


def post(path, body):
    req = urllib.request.Request(
        BASE + path, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"}, method="POST",
    )
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"error": json.loads(e.read()).get("error", str(e))}


TTC_NAMES = [
    "ঢাকা কারিগরি প্রশিক্ষণ কেন্দ্র",
    "চট্টগ্রাম দক্ষতা উন্নয়ন কেন্দ্র",
    "সিলেট টেকনিক্যাল কেন্দ্র",
    "রাজশাহী প্রশিক্ষণ কেন্দ্র",
    "খুলনা কারিগরি ইনস্টিটিউট",
]
TTC_WEIGHTS = [92, 78, 85, 60, 45]  # BMET's initial trust weight per center

COMPANY_NAMES = ["গালফ কনস্ট্রাকশন", "সৌদি বিল্ডার্স", "দুবাই ইন্ডাস্ট্রিজ"]

WORKER_NAMES = [
    "রহিম উদ্দিন", "করিম মিয়া", "ফাতিমা বেগম", "জামাল হোসেন", "নাসির আহমেদ",
    "সালমা খাতুন", "আব্দুল কাদের", "রফিক ইসলাম", "হাসান আলী", "আয়েশা আক্তার",
    "ইব্রাহিম খলিল", "নূর মোহাম্মদ", "বিলাল হোসেন", "জয়নাল আবেদীন", "মিনা বেগম",
    "সোহেল রানা", "তানভীর আহমেদ", "রুবেল মিয়া", "শাহিন আলম", "মুন্না শেখ",
]
TRADES = ["ওয়েল্ডিং", "ইলেকট্রিশিয়ান", "প্লাম্বিং", "রাজমিস্ত্রি", "কার্পেন্টার"]


def main():
    print("=== প্রশিক্ষণ কেন্দ্র (5) ===")
    ttcs = []
    for i, name in enumerate(TTC_NAMES):
        o = post("/api/orgs", {"name": name, "type": "ttc", "email": f"ttc{i+1}@gov.bd"})
        ttcs.append(o)
        # BMET sets an initial trust weight for the center.
        if o.get("did"):
            post("/api/agency-standing", {"agencyDID": o["did"], "delta": TTC_WEIGHTS[i], "evidenceHash": "seed"})
        print(f"  {o.get('orgId','?')}  {name}  weight={TTC_WEIGHTS[i]}")

    print("=== কোম্পানি (3) ===")
    for i, name in enumerate(COMPANY_NAMES):
        o = post("/api/orgs", {"name": name, "type": "company", "email": f"hr{i+1}@company.com"})
        print(f"  {o.get('orgId','?')}  {name}")

    print("=== কর্মী (20) + সনদ ===")
    for i, name in enumerate(WORKER_NAMES):
        w = post("/api/workers", {"name": name, "nid": f"19{90+i:02d}{1000+i}", "address": "বাংলাদেশ"})
        if not w.get("did"):
            print(f"  {name}: {w.get('error')}")
            continue
        ttc = ttcs[i % len(ttcs)]  # rotate centers
        trade = TRADES[i % len(TRADES)]
        level = (i % 5) + 1
        post("/api/credentials", {
            "schemaId": "SkillCredential-v1", "issuerDID": ttc["did"],
            "subjectDID": w["did"], "claims": {"trade": trade, "level": level, "score": 70 + (i % 30)},
        })
        print(f"  {w['workerId']}  {name}  ←  {trade} (স্তর {level}) · {ttc['name']}")

    print("\n✓ ডেমো ডেটা তৈরি হয়েছে।")


if __name__ == "__main__":
    main()
