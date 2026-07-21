"""
Seed five sample testimonials (3 approved on the public site, 1 pending, 1
rejected) so the user can visually verify the new Testimonials experience.
Run from /app/backend: python seed_testimonials.py
"""
import asyncio
import os
import uuid
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

SAMPLES = [
    {
        "client_name": "Riya Sharma",
        "company": "Quantleaf Health",
        "designation": "Co-founder & CEO",
        "project_name": "Patient onboarding app",
        "rating": 5,
        "format": "text",
        "message": "PROJEXINO didn't just deliver an app — they delivered a competitive edge. Our patient onboarding time dropped from 14 minutes to 3, and the team felt like an extension of ours from day one. Easily the best engineering partner we've worked with.",
        "status": "approved",
        "featured": True,
    },
    {
        "client_name": "Daniel Roberts",
        "company": "Northwind Capital",
        "designation": "CTO",
        "project_name": "Trading dashboard rebuild",
        "rating": 5,
        "format": "text",
        "message": "We rebuilt our internal trading dashboard in 9 weeks with PROJEXINO. Real-time updates, glass-clean UI and zero downtime since launch. They sweat the details — exactly what a finance team needs.",
        "status": "approved",
        "featured": False,
    },
    {
        "client_name": "Aisha Khan",
        "company": "Lumen Studios",
        "designation": "Founder",
        "project_name": "Marketing OS",
        "rating": 4,
        "format": "text",
        "message": "Reliable, fast and genuinely creative. The marketing OS they shipped has cut our planning overhead in half. Communication is always crisp — exactly the partner you want for an early-stage brand.",
        "status": "approved",
        "featured": False,
    },
    {
        "client_name": "Marco Bianchi",
        "company": "Veloce Logistics",
        "designation": "Head of Product",
        "project_name": "Driver dispatch platform",
        "rating": 5,
        "format": "text",
        "message": "Looking forward to going live next month — early demos look incredible. The team has been responsive on every iteration.",
        "status": "pending",   # still pending — visible only in admin Pending tab
        "featured": False,
    },
    {
        "client_name": "Sara Lin",
        "company": "Brightedge Retail",
        "designation": "Store Operations Lead",
        "project_name": "Inventory mobile app",
        "rating": 2,
        "format": "text",
        "message": "App works but the onboarding was rougher than expected and a few release notes were missed.",
        "status": "rejected",  # rejected — visible only in admin Rejected tab
        "featured": False,
    },
]

async def main():
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    # Idempotency: wipe previous SEED_ testimonials
    await db.testimonials.delete_many({"source": "seed_demo"})

    now = datetime.now(timezone.utc).isoformat()
    for s in SAMPLES:
        doc = {
            **s,
            "id": uuid.uuid4().hex,
            "request_id": "",
            "source": "seed_demo",
            "email": "",
            "video_path": "",
            "avatar_path": "",
            "admin_note": "",
            "submitted_at": now,
            "approved_at": now if s["status"] == "approved" else "",
            "approved_by": "admin@projexino.com" if s["status"] == "approved" else "",
            "created_by": "admin@projexino.com",
        }
        await db.testimonials.insert_one(doc)
        print(f"  · {s['client_name']:24} → {s['status']}")
    total = await db.testimonials.count_documents({})
    approved = await db.testimonials.count_documents({"status": "approved"})
    print(f"\nDone. Total in DB: {total}  ·  Approved (live on site): {approved}")
    client.close()

if __name__ == "__main__":
    asyncio.run(main())
