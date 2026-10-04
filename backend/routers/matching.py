"""AI engine: donor–NGO matching, volunteer allocation and the priority queue."""
from fastapi import APIRouter, Depends, Query

from ai_engine.matching import match_donation
from ai_engine.priority_engine import get_priority_queue
from ai_engine.volunteer_allocator import allocate_volunteer
from errors import conflict, forbidden
from models.matching import AllocateRequest
from services.auth_service import require_roles
from services.db_service import db, utcnow
from services.donation_service import get_donation, public_donation

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/match/{donation_id}")
async def run_match(donation_id: str, user: dict = Depends(require_roles("donor", "admin"))):
    """Rank compatible NGOs for a donation and offer it to the best one."""
    donation = await get_donation(donation_id)
    if user["role"] == "donor" and donation["donor_id"] != user["_id"]:
        raise forbidden()
    return await match_donation(donation["_id"])


@router.post("/allocate-volunteer")
async def run_allocation(body: AllocateRequest, user: dict = Depends(require_roles("admin", "ngo"))):
    donation = await get_donation(body.donation_id)
    if user["role"] == "ngo":
        ngo = await db.ngos.find_one({"user_id": user["_id"]}, {"_id": 1})
        if not ngo or donation.get("matched_ngo_id") != ngo["_id"]:
            raise forbidden()
    if not donation.get("ngo_accepted") or donation["status"] != "matched":
        raise conflict("Volunteers can only be allocated to NGO-accepted donations awaiting pickup", "NOT_ALLOCATABLE")
    if donation.get("assigned_volunteer_id"):
        raise conflict("A volunteer is already assigned to this donation", "ALREADY_ASSIGNED")
    return {"assignment": await allocate_volunteer(donation["_id"])}


@router.get("/priority-queue")
async def priority_queue(limit: int = Query(50, ge=1, le=200), _: dict = Depends(require_roles("admin", "volunteer"))):
    now = utcnow()
    return [public_donation(d, now) for d in await get_priority_queue(limit)]
