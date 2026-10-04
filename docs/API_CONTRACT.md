# YIELD WRAP — API Contract

Interactive docs are served by FastAPI at `http://localhost:8000/docs`. This file is the
human-readable contract shared between the backend and the React frontend.

## Conventions

- Base URL: `VITE_API_URL` (default `http://localhost:8000`). All REST paths start with `/api`.
- Auth: JWT in **httpOnly cookies** (`access_token`, 30 min; `refresh_token`, 7 days). The browser
  must send requests with `withCredentials: true`. Tokens are never returned in JSON bodies.
  On `401` with code `TOKEN_EXPIRED` / `UNAUTHORIZED`, call `POST /api/auth/refresh` once, then retry.
- IDs: every document is returned with a string `id` (never `_id`). References (`donor_id`,
  `matched_ngo_id`, …) are strings. Datetimes are ISO‑8601 UTC strings.
- Errors: `{"error": "Human readable message", "code": "MACHINE_CODE"}` with a proper HTTP status.
  Validation errors are `422` with code `VALIDATION_ERROR` and an extra `details` array.
- Roles: `donor | ngo | volunteer | admin`. Role-restricted routes return `403 FORBIDDEN`.

## Core objects

**User**
```json
{"id","name","email","role","phone","location":{"address","lat","lng"},
 "is_verified":bool,"is_suspended":bool,"is_premium_partner":bool,"created_at"}
```

**Donation**
```json
{"id","donor_id","donor_name",
 "food_items":[{"name","category":"cooked|raw|packaged|dairy|produce","quantity_kg","expiry_time","allergens":[]}],
 "pickup_location":{"address","lat","lng"},
 "status":"pending|matched|in_transit|delivered|expired|cancelled",
 "urgency_level":"low|medium|high|critical",
 "total_kg","earliest_expiry",
 "matched_ngo_id","matched_ngo_name","delivery_location",
 "ngo_accepted":bool,
 "assigned_volunteer_id","assigned_volunteer_name",
 "task_stage":"assigned|accepted|at_pickup|picked_up|delivered|null",
 "ai_match_score","match_candidates":[{"ngo_id","organization_name","score","distance_km"}],
 "priority_score",
 "created_at","matched_at","picked_up_at","delivered_at",
 "delivery_record":{"delivered_at","volunteer_id","receiver_name","quantity_confirmed_kg"}|null}
```

Lifecycle: `pending` → (AI match) `matched` with `ngo_accepted=false` → NGO accepts
(`ngo_accepted=true`, volunteer auto-allocated, `task_stage=assigned`) → volunteer accepts
(`accepted`) → `at_pickup` → `picked_up` (status becomes `in_transit`) → `delivered`.
A background job marks donations whose food has expired before pickup as `expired`.

**NGO profile**
```json
{"id","user_id","organization_name","registration_number","document_url","location",
 "accepted_food_types":[],"storage_capacity_kg","current_load_kg","beneficiary_count",
 "operating_hours":{"open":"HH:MM","close":"HH:MM"},"is_active","acceptance_rate","is_verified"}
```

**Volunteer profile**
```json
{"id","user_id","name","vehicle_type":"bike|car|van|on_foot","availability":bool,
 "current_location":{"lat","lng"},"active_task_id","completed_deliveries","rating","hours_contributed"}
```

## Auth `/api/auth`
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/register` | `{name,email,password,role,phone,location, organization_name?, registration_number?, accepted_food_types?, storage_capacity_kg?, beneficiary_count?, vehicle_type?, admin_code?}` | `{user}` + cookies. Admin requires `admin_code == ADMIN_SIGNUP_CODE`. |
| POST | `/ngo-document` | multipart `file` (pdf/png/jpg ≤ 5 MB), NGO only | `{document_url}` |
| POST | `/login` | `{email,password}` | `{user}` + cookies |
| POST | `/refresh` | — (uses refresh cookie) | `{user}` + new cookies |
| POST | `/logout` | — | `{ok:true}` clears cookies |
| GET | `/me` | — | `{user, profile}` (`profile` = NGO/volunteer profile or `null`) |
| PUT | `/me` | `{name?,phone?,location?}` | `{user}` |
| POST | `/fcm-token` | `{token}` | `{ok:true}` |

## Donor `/api/donor` (role donor)
| Method | Path | Notes |
|---|---|---|
| POST | `/donations` | body `{food_items, pickup_location, urgency_level}` → Donation |
| GET | `/donations` | own donations, newest first |
| GET | `/donations/{id}` | Donation |
| PUT | `/donations/{id}` | only while `pending` → Donation |
| DELETE | `/donations/{id}` | cancel (allowed until picked up) → Donation |
| GET | `/donations/{id}/track` | `{donation_id,status,task_stage,volunteer:{id,name,vehicle_type,location}|null,pickup_location,delivery_location,eta_minutes}` |
| GET | `/stats` | `{donations_count,delivered_count,total_kg_donated,meals_contributed,co2_saved_kg}` |

## NGO `/api/ngo` (role ngo)
| Method | Path | Notes |
|---|---|---|
| GET | `/profile` / PUT `/profile` | NGO profile (partial update) |
| GET | `/available-donations` | `[Donation + {offer_type:"offer"|"open", match_score}]` — AI offers to this NGO, then open pending donations it is compatible with |
| POST | `/accept/{donation_id}` | → `{donation, volunteer_assignment|null}` |
| POST | `/decline/{donation_id}` | offer passes to the next candidate → `{ok:true}` |
| GET | `/incoming` | accepted, not yet delivered donations (with volunteer location) |
| PUT | `/capacity` | `{current_load_kg, storage_capacity_kg?}` → profile |
| GET | `/history` | delivered donations |
| GET | `/history.csv` | CSV download |

## Volunteer `/api/volunteer` (role volunteer)
| Method | Path | Notes |
|---|---|---|
| GET | `/profile` | Volunteer profile |
| PUT | `/availability` | `{availability: bool}` → profile |
| GET | `/tasks` | assigned, not delivered tasks (Donation + `priority_score`) |
| POST | `/tasks/{id}/accept` | → Donation |
| POST | `/tasks/{id}/decline` | re-allocates to another volunteer → `{ok:true}` |
| PUT | `/tasks/{id}/status` | `{status:"at_pickup"|"picked_up"|"delivered", receiver_name?, quantity_confirmed_kg?}` (both required for delivered) → Donation |
| PUT | `/location` | `{lat,lng}` → `{ok:true}`; pushed to WebSocket subscribers |
| GET | `/history` | delivered tasks |
| GET | `/leaderboard` | `[{volunteer_id,name,vehicle_type,deliveries_this_month,completed_deliveries,rating}]` |

## Admin `/api/admin` (role admin)
| Method | Path | Notes |
|---|---|---|
| GET | `/users?role=&q=` | `[User + {profile}]` |
| PUT | `/users/{id}/verify` | `{is_verified: bool}` → User |
| PUT | `/users/{id}/suspend` | `{is_suspended: bool}` → User |
| DELETE | `/users/{id}` | `{ok:true}` |
| GET | `/donations?status=` | all donations |
| GET | `/system-stats` | `{users_by_role, donations_by_status, total_kg_redistributed, total_kg_wasted, meals_served_estimate}` |
| POST | `/broadcast` | `{title, body, role?: role|null}` → `{recipients, push_sent}` |
| GET | `/map` | `{donations:[…], volunteers:[{id,name,location,availability}], ngos:[{id,organization_name,location,load_pct}]}` |

## AI engine `/api/ai`
| Method | Path | Notes |
|---|---|---|
| POST | `/match/{donation_id}` | donor owner/admin → `{donation, matches:[{ngo_id,organization_name,score,distance_km,breakdown}]}` |
| GET | `/forecast?days=7` | `{forecast:[{date,predicted_kg,confidence}], model:{source:"random_forest"|"baseline", trained_at, samples}}` |
| POST | `/route` | `{volunteer_location, pickup_location, delivery_location, vehicle_type}` → `{distance_km,eta_minutes,polyline,steps,provider:"google"|"fallback"}` |
| POST | `/route/multi` | `{start, stops:[{id,lat,lng}], vehicle_type}` → `{ordered_stops:[…cumulative_eta_minutes,cumulative_distance_km], total_distance_km, total_eta_minutes}` |
| POST | `/allocate-volunteer` | `{donation_id}` (admin/ngo) → `{assignment:{volunteer_id,name,score,distance_km}|null}` |
| GET | `/priority-queue` | admin/volunteer → pending/matched donations sorted by `priority_score` |

## Analytics `/api/analytics`
| Method | Path | Notes |
|---|---|---|
| GET | `/public-impact` | **no auth** → `{kg_saved, meals_served, active_ngos, co2_saved_kg}` |
| GET | `/dashboard` | `{donations_today,kg_redistributed_today,kg_redistributed_total,active_volunteers,pending_matches,in_transit,meals_served_estimate,avg_delivery_time_min}` |
| GET | `/donations/trend?period=daily|weekly&days=30` | `[{date, donations, kg}]` |
| GET | `/food-types` | `[{category, kg, count}]` |
| GET | `/volunteer-performance?limit=10` | `[{volunteer_id,name,completed_deliveries,rating}]` |
| GET | `/ngo-utilization` | `[{ngo_id,organization_name,storage_capacity_kg,current_load_kg,received_kg,utilization_pct}]` |
| GET | `/waste-saved` | `{kg_saved, co2_saved_kg, meals_served, water_saved_liters}` |

## Notifications `/api/notifications`
In-app inbox (every push is also stored here, so it works without Firebase).
`GET /` → `[{id,title,body,data,read,created_at}]` · `POST /{id}/read` · `POST /read-all` · `GET /unread-count` → `{count}`

## Ad-Tech `/api/ads`
| Method | Path | Notes |
|---|---|---|
| GET | `/?slot=leaderboard|rectangle|mobile&page=` | auth optional → `{ad:{id,title,body,image_url,cta,url,sponsor,slot,width,height,category}}` chosen by role, location and time of day |
| POST | `/impression` | `{ad_id, slot, page}` logs `ad_id, user_role, timestamp, page` |
| POST | `/click` | same body |
| GET | `/partners` | verified premium partners `[{user_id,name,role,badge}]` |

## WebSocket
`/ws/volunteer/{volunteer_id}/location` — authenticated via the `access_token` cookie.
Subscribers (donor/NGO of an active task, admin) receive `{volunteer_id, lat, lng, timestamp}`.
The volunteer themself may also send `{lat,lng}` frames on the socket to publish.

---

# Packaging Ad-Tech (v2)

Donated food packaging is ad space. When a donor lists a donation with `packet_count = N`
and opts in with one of their approved creatives, **`floor(N × AD_OWN_SHARE)`** packets (default 50 %)
carry the donor's own sticker **for free**. The remaining packets go into the **sponsored pool**,
which other advertisers fill by spending **ad credits**. Credits are bought through **Razorpay**.
Volunteers stick the ads on at pickup. NGOs earn a revenue share for packets they receive and for posters they host.

## Roles
- New role **`business`**: companies that advertise without donating. Register fields:
  `business_name` (required, 2–150), `business_type` (`restaurant|hotel|cafe|caterer|retail|other`, default `other`), `website?`.
  Profile is stored in the `businesses` collection; `GET /api/auth/me` returns it as `profile`
  `{id,user_id,business_name,business_type,website}`. Businesses are auto-verified. Dashboard: `/business`.
- **Advertisers** = roles `donor`, `business` (admin is also allowed, for testing). NGOs host ad spaces and earn.

## Pricing (`GET /api/ads/pricing`, public)
```json
{"credit_value_inr": 5, "own_share": 0.5, "ngo_revenue_share": 0.3,
 "costs": {"packet_sticker": 2, "ngo_poster_week_default": 50, "digital_per_1000": 10},
 "packs": [{"id":"starter","credits":100,"price_inr":499},
           {"id":"growth","credits":500,"price_inr":1999},
           {"id":"pro","credits":2000,"price_inr":6999}],
 "payments": {"provider": "razorpay"|"simulated", "key_id": "rzp_test_…"|null}}
```
`provider = "simulated"` only when Razorpay keys are not configured **and** `ENVIRONMENT != production`
(dev/demo checkout). In production without keys, order creation returns 503 `PAYMENTS_UNAVAILABLE`.

## Wallet & payments (advertisers)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/ads/wallet` | `{credits, credit_value_inr, earnings_credits, transactions:[{id,type:"purchase"|"spend"|"refund"|"earning"|"grant",credits,balance_after,note,ref_id,created_at}]}` (latest 50). NGOs can call it too (earnings). |
| POST | `/api/ads/orders` | `{pack_id}` → `{order_id, provider, razorpay_order_id|null, key_id|null, amount_paise, currency:"INR", credits, name:"YIELD WRAP", description, prefill:{name,email,contact}}` |
| POST | `/api/ads/orders/{order_id}/verify` | razorpay: `{razorpay_order_id, razorpay_payment_id, razorpay_signature}` (HMAC-SHA256 of `order_id|payment_id` with key secret); simulated: `{}` → `{order:{id,status:"paid",credits}, wallet:{credits}}`. Idempotent. Bad signature → 400 `PAYMENT_VERIFICATION_FAILED`. |
| POST | `/api/ads/webhooks/razorpay` | Razorpay webhook (`payment.captured`, `order.paid`), header `X-Razorpay-Signature` = HMAC-SHA256(raw body, webhook secret). Credits the order idempotently. No auth. |

## Creatives (advertisers)
Creative = **one design used everywhere** (sticker, poster, digital banner).
`{id, owner_id, owner_name, title (2–60), tagline (≤120), url (http/https, optional), image_url|null,
  status:"pending"|"approved"|"rejected", rejection_reason|null, created_at, reviewed_at}`
| Method | Path | Notes |
|---|---|---|
| GET | `/api/ads/creatives` | own creatives (admin: `?status=` all) |
| POST | `/api/ads/creatives` | **multipart**: `title`, `tagline?`, `url?`, `image?` (PNG/JPG ≤ 5 MB) → creative (`pending`) |
| DELETE | `/api/ads/creatives/{id}` | only if no active campaign uses it → `{ok:true}` |
| GET | `/api/ads/creatives/{id}/image` | public once approved (owner/admin always) |
| PUT | `/api/admin/ad-creatives/{id}/review` | admin `{approved: bool, reason?}` → creative; owner is notified |

## Campaigns (advertisers)
Credits are **debited when the campaign is created**; unused parts are refunded on cancel/expiry.
```json
{"id","owner_id","owner_name","creative_id","creative":{title,tagline,image_url,url},
 "type":"packet"|"ngo_poster"|"digital","status":"active"|"completed"|"cancelled"|"rejected",
 "credits_spent","credits_refunded","created_at",
 "packet":{"packets_requested","packets_allocated","packets_applied","target":{"lat","lng","radius_km"}|null}|null,
 "poster":{"ad_space_id","ngo_id","ngo_name","space_name","weeks","starts_at","ends_at","booking_status":"requested"|"displayed"|"declined"}|null,
 "digital":{"impressions_purchased","impressions_served","clicks"}|null,
 "scans": int}
```
| Method | Path | Notes |
|---|---|---|
| GET | `/api/ads/campaigns` | own campaigns, newest first (admin: all) |
| POST | `/api/ads/campaigns` | `{type:"packet", creative_id, packets (1–100000), target?:{lat,lng,radius_km}}` cost `packets × packet_sticker` · `{type:"ngo_poster", creative_id, ad_space_id, weeks (1–12)}` cost `weeks × space.credits_per_week` · `{type:"digital", creative_id, impressions (1000–1000000, multiple of 1000)}` cost `impressions/1000 × digital_per_1000`. Creative must be **approved** and owned. Insufficient balance → 402 `INSUFFICIENT_CREDITS`. → campaign |
| POST | `/api/ads/campaigns/{id}/cancel` | refunds unallocated packets / undisplayed poster / unserved impressions → campaign |
| GET | `/api/ads/inventory` | marketplace stats `{open_pool_packets, packets_stickered_30d, active_packet_campaigns, pending_packet_demand}` |
| GET | `/api/ads/spaces?lat=&lng=&radius_km=` | active NGO ad spaces `[{id,ngo_id,ngo_name,name,description,size,credits_per_week,location,distance_km|null,is_verified}]` |

## Donation packaging
`DonationCreate`/`DonationUpdate` gain `packet_count` (int 0–100000, default 0) and `own_ad_creative_id` (optional, donor's approved creative; ignored when `packet_count` is 0).
Every Donation gains:
```json
"packaging": {"packet_count", "own_ad": {"creative_id","title","packets"}|null,
              "sponsored_capacity",            // packet_count − own packets
              "sponsored": [{"campaign_id","creative_id","owner_name","title","packets"}],
              "stickers_total",                // own + Σ sponsored packets
              "stickers_applied": {"count","applied_at","volunteer_id"}|null}
```
- **Allocation:** when the NGO **accepts** the donation, the pool (`sponsored_capacity`) is filled from active `packet`
  campaigns, oldest first. A campaign only takes part if it has no `target`, or the pickup is within `target.radius_km`. Allocated packets are added to `packets_allocated`.
  The dispatcher also retries filling (`allocate_waiting` cycle) for accepted donations not yet picked up.
- **Release:** cancel/expiry before pickup returns allocated packets to their campaigns.
- **Pickup:** `PUT /api/volunteer/tasks/{id}/status` with `status:"picked_up"` **requires** `stickers_applied`
  (int 0…`stickers_total`) when `stickers_total > 0` (422 otherwise). Sponsored stickers are counted first, in allocation order, then own.
  Any shortfall is released back to the campaigns. Campaign `packets_applied` is incremented.
  A packet campaign becomes `completed` when `packets_applied == packets_requested`.
- **Delivery:** on `delivered`, the receiving NGO earns `floor(sponsored_applied × packet_sticker × ngo_revenue_share)` credits
  (an `earning` transaction).
- **Sticker sheet:** `GET /api/ads/stickers/{donation_id}` (donor, matched NGO, assigned volunteer, admin) →
  `{donation_id, donor_name, packet_count, stickers:[{kind:"own"|"sponsored", campaign_id|null, owner_name, creative:{id,title,tagline,image_url,url}, count, qr_url}]}`.
  `qr_url` = `{API}/api/ads/s/{creative_id}?d={donation_id}`.
- **QR scan:** `GET /api/ads/s/{creative_id}?d=` (public) logs to `ad_scans` and 302-redirects to the creative's `url`
  (or the frontend landing page if it has none).

## NGO ad spaces (role ngo)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/ngo/ad-spaces` | own spaces |
| POST | `/api/ngo/ad-spaces` | `{name (2–80), description?, size? (e.g. "A3 poster"), credits_per_week (10–10000)}` → space (location = NGO location) |
| PUT / DELETE | `/api/ngo/ad-spaces/{id}` | partial update incl. `active` / delete (only with no live booking) |
| GET | `/api/ngo/ad-bookings` | poster campaigns booked on own spaces (campaign objects) |
| POST | `/api/ngo/ad-bookings/{campaign_id}/displayed` | NGO confirms the poster is up. The NGO earns `floor(credits_spent × ngo_revenue_share)` and `starts_at`/`ends_at` are set |
| POST | `/api/ngo/ad-bookings/{campaign_id}/decline` | full refund to advertiser, campaign `rejected` |

## Digital ads
`GET /api/ads/?slot=&page=` now also serves **approved active `digital` campaigns** (`ad.id = "cmp_<campaign_id>"`,
`sponsor = owner_name`, `is_paid: true`). They get a higher selection weight than house ads.
`POST /api/ads/impression` with a `cmp_` id increments `impressions_served`; the campaign completes when it reaches `impressions_purchased`.
Clicks increment `digital.clicks`.

## Admin
| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/ad-creatives?status=pending` | review queue |
| PUT | `/api/admin/ad-creatives/{id}/review` | see above |
| GET | `/api/admin/ad-revenue` | `{credits_sold, revenue_inr, orders_paid, credits_spent_by_type:{packet,ngo_poster,digital}, credits_refunded, ngo_earnings_credits, packets_stickered, packets_own, packets_sponsored, scans, active_campaigns, pending_creatives, top_advertisers:[{owner_id,owner_name,credits_spent}]}` |
| POST | `/api/admin/users/{id}/credits` | `{credits (−100000…100000, ≠0), note}` manual grant/adjustment → `{credits}` |
