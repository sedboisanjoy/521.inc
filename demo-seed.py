#!/usr/bin/env python3
"""Seed the Employment Passport backend with demo data across all five §3.1
surfaces: 5 training centers, 3 companies, 20 workers + skill certs, plus
employment proofs, verified-anonymous reviews (one flagging a violation),
employer+bank co-signed wage events, RJSC company registrations, UBO threshold
proofs, a procurement award, a wage-bill reconciliation, and an endorsement.

Safe to re-run after a backend restart.  Usage: python3 demo-seed.py
"""
import json
import urllib.request
import urllib.error

BASE = "http://localhost:8080"

# Fixed actor DIDs (registered on-chain by the backend at startup).
DID_BANK = "did:key:bank"


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


def get_digest(agency_did):
    try:
        with urllib.request.urlopen(BASE + "/api/agencies/" + agency_did + "/standing-digest") as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"error": str(e)}


TTC_NAMES = [
    "Dhaka Technical Training Center",
    "Chattogram Skills Development Center",
    "Sylhet Technical Center",
    "Rajshahi Training Center",
    "Khulna Polytechnic Institute",
]
TTC_WEIGHTS = [92, 78, 85, 60, 45]  # BMET's initial trust weight per center

COMPANY_NAMES = ["Gulf Construction", "Saudi Builders", "Dubai Industries"]

WORKER_NAMES = [
    "Rahim Uddin", "Karim Mia", "Fatima Begum", "Jamal Hossain", "Nasir Ahmed",
    "Salma Khatun", "Abdul Kader", "Rafiq Islam", "Hasan Ali", "Ayesha Akter",
    "Ibrahim Khalil", "Nur Mohammad", "Bilal Hossain", "Zainal Abedin", "Mina Begum",
    "Sohel Rana", "Tanvir Ahmed", "Rubel Mia", "Shahin Alam", "Munna Sheikh",
]
TRADES = ["Welding", "Electrician", "Plumbing", "Masonry", "Carpentry"]


def main():
    print("=== Training Centers (5) ===")
    ttcs = []
    for i, name in enumerate(TTC_NAMES):
        o = post("/api/orgs", {"name": name, "type": "ttc", "email": f"ttc{i+1}@gov.bd"})
        ttcs.append(o)
        if o.get("did"):
            post("/api/agency-standing", {"agencyDID": o["did"], "delta": TTC_WEIGHTS[i], "evidenceHash": "seed"})
        print(f"  {o.get('orgId','?')}  {name}  weight={TTC_WEIGHTS[i]}")

    print("=== Companies (3) ===")
    companies = []
    for i, name in enumerate(COMPANY_NAMES):
        o = post("/api/orgs", {"name": name, "type": "company", "email": f"hr{i+1}@company.com"})
        companies.append(o)
        print(f"  {o.get('orgId','?')}  {name}")

    print("=== Workers (20) + skill certificates ===")
    workers = []
    for i, name in enumerate(WORKER_NAMES):
        w = post("/api/workers", {"name": name, "nid": f"19{90+i:02d}{1000+i}", "address": "Bangladesh"})
        workers.append(w)
        if not w.get("did"):
            print(f"  {name}: {w.get('error')}")
            continue
        ttc = ttcs[i % len(ttcs)]
        trade = TRADES[i % len(TRADES)]
        level = (i % 5) + 1
        cert = post("/api/credentials", {
            "schemaId": "SkillCredential-v1", "issuerDID": ttc["did"],
            "subjectDID": w["did"], "claims": {"trade": trade, "level": level, "score": 70 + (i % 30)},
        })
        # Capture the cert hash + skill facts so §3.8 applications can attest them.
        w["name"] = name
        w["certHash"] = cert.get("credHash")
        w["trade"] = trade
        w["level"] = level
        print(f"  {w['workerId']}  {name}  <-  {trade} (level {level}) · {ttc['name']}")

    co0 = companies[0]
    co0did, co0name = co0["did"], co0["name"]

    print("\n=== Surface 3 — Corporate identity (RJSC + BFIU) ===")
    for co in companies:
        post("/api/companies", {"companyDID": co["did"], "legalName": co["name"] + " Ltd", "regNo": "C-" + co["orgId"]})
        post(f"/api/companies/{co['did']}/ubo", {"thresholdOk": True, "note": "No owner above 25% is sanctioned/PEP"})
        print(f"  registered + UBO proof: {co['name']}")
    post("/api/procurement", {"companyDID": co0did, "title": "Metro depot fit-out", "amount": 500000, "conflictOk": True})
    print(f"  procurement award anchored for {co0name}")

    print("\n=== Surface 4 — Operations Suite (employment proofs + wage events) ===")
    # Onboard the first three workers at company 0, then run payroll for two of them.
    onboarded = workers[:3]
    for w in onboarded:
        post("/api/employment-proofs", {"employerDID": co0did, "employer": co0name, "workerDID": w["did"]})
    total = 0
    for w, amt, month in [(workers[0], 25000, "2026-07"), (workers[1], 30000, "2026-07")]:
        we = post("/api/wage-events", {"employerDID": co0did, "employer": co0name,
                                       "workerDID": w["did"], "amount": amt, "month": month})
        if we.get("credHash"):
            post("/api/wage-events/cosign", {"credHash": we["credHash"], "bankDID": DID_BANK})
            total += amt
    post(f"/api/companies/{co0did}/wagebill", {"amount": total})
    print(f"  onboarded 3, 2 wage events co-signed by the bank, wage bill {total} reconciled")

    print("\n=== Surface 2 + 5 — Reviews + enforcement (policy-gated) ===")
    # worker0 was actually paid on the bank rail (25000 co-signed above), so a WAGE
    # complaint is contradicted by anchored payroll → REFUTED, does NOT escalate.
    r0 = post("/api/reviews", {
        "companyDID": co0did, "company": co0name, "workerDID": workers[0]["did"],
        "linkSecret": f"{workers[0]['did']}:{co0did}", "rating": 2, "recommend": False,
        "violationCode": "wage", "text": "Claims wages were unpaid.",
    })
    print(f"  worker0 WAGE flag → escalated={r0.get('escalated')} :: {r0.get('reason')}")
    # workers 1 & 2 both flag SAFETY (opinion, not payroll-checkable). One alone is
    # held below threshold; the second crosses the severity threshold (K=2) → escalates.
    r1 = post("/api/reviews", {
        "companyDID": co0did, "company": co0name, "workerDID": workers[1]["did"],
        "linkSecret": f"{workers[1]['did']}:{co0did}", "rating": 2, "recommend": False,
        "violationCode": "safety", "text": "Scaffolding looked unsafe.",
    })
    print(f"  worker1 SAFETY flag → escalated={r1.get('escalated')} :: {r1.get('reason')}")
    r2 = post("/api/reviews", {
        "companyDID": co0did, "company": co0name, "workerDID": workers[2]["did"],
        "linkSecret": f"{workers[2]['did']}:{co0did}", "rating": 2, "recommend": False,
        "violationCode": "safety", "text": "No safety harness provided.",
    })
    print(f"  worker2 SAFETY flag → escalated={r2.get('escalated')} :: {r2.get('reason')}")

    print("\n=== Surface 1 — Staked endorsement ===")
    post("/api/endorsements", {"endorserDID": co0did, "endorser": co0name,
                               "workerDID": workers[0]["did"], "competence": "Certified welder, level 3"})
    print(f"  {co0name} endorsed {WORKER_NAMES[0]}")

    print("\n=== §3.8 — Job marketplace + agency accountability ===")
    co1 = companies[1]
    co1did, co1name = co1["did"], co1["name"]
    # Agencies register as orgs (type "agency") — like companies do — and are
    # licensed on admission, so they appear in the agency login directory.
    agency_names = ["Prime Recruitment Ltd", "Coastal Manpower", "Metro Overseas"]
    agencies = []
    for i, ag_name in enumerate(agency_names):
        o = post("/api/orgs", {"name": ag_name, "type": "agency", "email": f"agency{i+1}@baira.org.bd"})
        agencies.append(o)
        print(f"  registered + licensed {ag_name} ({o.get('orgId','?')})")
    prime, coastal, metro = agencies[0], agencies[1], agencies[2]

    def submit_app(ag, co_did, co_name, w, claimed_level, years=3):
        return post("/api/applications", {
            "employerDID": co_did, "employer": co_name, "agencyDID": ag["did"],
            "workerDID": w["did"], "workerName": w.get("name", "Worker"),
            "attestedRefs": [w["certHash"]] if w.get("certHash") else [],
            "asserted": {"trade": w["trade"], "claimedLevel": claimed_level,
                         "experienceYears": years, "willingToRelocate": True,
                         "spokenLanguages": "Bangla, basic Arabic"},
        })

    # Prime: two honest placements — asserted == attested level.
    submit_app(prime, co0did, co0name, workers[0], workers[0]["level"])
    submit_app(prime, co1did, co1name, workers[5], workers[5]["level"])
    # Metro: one honest placement — stays clean / high standing.
    submit_app(metro, co0did, co0name, workers[6], workers[6]["level"])
    # Coastal: one honest placement + one OVER-CLAIM → auto-contradiction.
    coastal_clean = submit_app(coastal, co1did, co1name, workers[1], workers[1]["level"])
    over = submit_app(coastal, co0did, co0name, workers[2], workers[2]["level"] + 2)
    print(f"  applications submitted; over-claim flagged: {over.get('contradiction')} ({over.get('contradictionNote','')})")

    # Employer files an allegation against Coastal's clean placement (open, in-window).
    if coastal_clean.get("id"):
        alg = post("/api/allegations", {
            "applicationId": coastal_clean["id"], "claim": "experienceYears",
            "detail": "Worker could not demonstrate the claimed informal experience on site.",
        })
        print(f"  allegation {alg.get('id','?')} filed against Coastal Manpower ({alg.get('status')})")

    for o in agencies:
        d = get_digest(o["did"])
        print(f"  standing · {o['name']}: score={d.get('score')} placements={d.get('placements')} "
              f"corroborated={d.get('corroborationPct')}% upheld={d.get('upheldDisputes')}")

    print("\n[done] Demo data seeded across all five surfaces + the §3.8 agency loop.")


if __name__ == "__main__":
    main()
