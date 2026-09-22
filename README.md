# 🏆 Operation Golden Keyboard

**A hostel-vs-hostel hacking competition platform.** Participants claim missions, crack them, and every point flows straight to their hostel's live leaderboard score.

📄 Original spec: [`TASK.md`](TASK.md)

![Django](https://img.shields.io/badge/Django-6-0C4B33?style=for-the-badge&logo=django&logoColor=white)
![DRF](https://img.shields.io/badge/DRF-JWT_Auth-A30000?style=for-the-badge&logo=django&logoColor=white)
![React](https://img.shields.io/badge/React-Vite-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Postman](https://img.shields.io/badge/Postman-Tested-FF6C37?style=for-the-badge&logo=postman&logoColor=white)

| 🧩 Piece | ⚙️ Stack |
|---|---|
| 🔧 Backend | Django 6 + DRF, JWT auth, SQLite |
| 🎨 Frontend | React + Vite — [`frontend/`](frontend/) |
| 🧪 API tests | Postman collection + environment — [`postman/`](postman/) |

---

## 🚀 Quickstart

```bash
# 🔧 Backend
uv sync
uv run python manage.py migrate
uv run python manage.py seed_hostels          # seeds the 17 BITS Pilani hostels
uv run python manage.py createsuperuser       # needed for any staff-only request
uv run python manage.py runserver             # → http://127.0.0.1:8000

# 🎨 Frontend (separate terminal)
cd frontend
npm install
npm run dev                                   # → http://localhost:5173
```

📚 **API docs (Swagger UI):** `http://127.0.0.1:8000/api/docs/`
📄 **Raw OpenAPI schema:** `/api/schema/`

🧪 No frontend needed? Import `postman/golden_keyboard.postman_collection.json` + its paired environment into Postman — see [🧪 The Postman collection](#-the-postman-collection) below.

---

## 🗂️ Project layout

```
config/           ⚙️  Django project: settings, root urls
mission/          🎯  Mission model, permissions, filters, viewset
participant/      🏠  Hostel + Participant models, register/hostel/participant viewsets
frontend/         🎨  React + Vite SPA
postman/          🧪  Postman collection + environment
TASK.md           📄  Original spec
```

---

## 🧬 Data model

```
🏠 Hostel (name)
  └─< 🧑 Participant (handle, user 1-1, hostel FK)
                        └─< 🎯 Mission.claimed_by      (1-1, nullable — one mission per participant)
                        └─< 🎯 Mission.completed_by    (FK, nullable)
🏠 Hostel
  └─< 🎯 Mission.completed_hostel  (FK, nullable — a shortcut, see below 👇)
```

> A `Mission` only ever stores its own `points`. Everything else — status, hostel score, the leaderboard — is **derived**, never manually set.

---

## 💡 Design decisions

### 🧮 Score is derived, never stored

Hostel score can never be hand-incremented — it's summed live from cracked missions:

```python
Hostel.objects.annotate(score=Coalesce(Sum("cracked_missions__points"), 0)).order_by("-score", "name")
```

⚠️ `Sum` over a hostel with **zero** cracked missions returns SQL `NULL` → Python `None` → `IntegerField.to_representation(None)` blows up. `Coalesce(..., 0)` closes that gap. Caught by reproducing the crash in a shell, not by reading the code.

### 🔗 A denormalized `completed_hostel` FK

"Which hostel cracked mission X?" used to take two hops: `Mission.completed_by.hostel`. Fine for one mission — expensive when the leaderboard needs it for *every* hostel, *every* request.

Fix: a second FK, set once, the moment a mission is completed:

```python
def complete(self, user_id):
    qs = self.__class__.objects.filter(pk=self.pk, claimed_by_id=user_id, completed_by__isnull=True, deadline__gt=now())
    hostel_id = Participant.objects.only("hostel_id").get(id=user_id).hostel_id
    return qs.update(completed_by_id=user_id, claimed_by=None, completed_hostel_id=hostel_id)
```

Both hot paths become a single-hop `related_name="cracked_missions"` lookup instead of a fan-out join. A conscious normalization trade-off — worth it since participants can't switch hostels, so it can't drift.

### ⚛️ Claim / drop / complete are atomic, filtered updates

Every mission action is **one `UPDATE ... WHERE ...`**, never read-then-write:

```python
def claim(self, user_id):
    return self.__class__.objects.filter(
        pk=self.pk, completed_by__isnull=True, claimed_by__isnull=True, deadline__gt=now()
    ).update(claimed_by_id=user_id)
```

The view checks the **row count**, not in-memory state:

```python
if not mission.claim(request.user.participant.pk):
    return Response({"detail": "Mission is not available to claim."}, status=status.HTTP_409_CONFLICT)
```

🔒 This is what makes "two people can't claim the same mission" true *under concurrency*, not just in the happy path — the `WHERE` and the `SET` happen in the same atomic statement, so there's no gap for a race to land in. Ownership and deadline checks ride along for free in the same `WHERE`.

### 🕒 Status is computed, never a column

```python
@property
def status(self):
    if self.completed_by is not None:
        return Status.CRACKED
    elif now() >= self.deadline:
        return Status.EXPIRED
    elif self.claimed_by is None:
        return Status.UNCLAIMED
    else:
        return Status.IN_PROGRESS
```

The spec is explicit: a stored `status` could lag behind a passed deadline. So it's never stored — computed fresh, every time, from the three fields that actually exist.

### 🛡️ Permissions: three small composable classes

```python
class IsReadOnly(BasePermission): ...      # anyone can GET
class IsStaff(BasePermission): ...         # only staff can write
class IsParticipant(BasePermission): ...   # must have a linked Participant
```

`MissionViewSet` / `HostelViewSet` use `[IsReadOnly | IsStaff]` — reads are open, writes need staff. Claim/drop/complete are the *only* participant-facing mutations, gated by `IsParticipant` on just those actions. **Ownership itself** is enforced inside the query (`claimed_by_id=user_id`), not by a permission class — a permission class can't know "is this the mission *this* participant claimed."

### 🔍 Filtering a computed field

`django-filter`'s shortcut only works on real columns — `status` isn't one, so it gets a method filter that re-derives the same logic as a `WHERE` clause:

```python
def filter_status(self, queryset, name, value):
    current = now()
    if value == Status.UNCLAIMED:
        return queryset.filter(completed_by__isnull=True, claimed_by__isnull=True, deadline__gt=current)
    # ...
```

`hostel` gets the same treatment, since no single FK means "this mission's hostel" across every state:

```python
def filter_hostel(self, queryset, name, value):
    return queryset.filter(Q(claimed_by__hostel_id=value) | Q(completed_hostel_id=value))
```

`difficulty` is a real column, so it's left to django-filter's default exact-match — no reason to hand-roll what already works.

### 🥇 The leaderboard reuses `HostelViewSet` — verbatim

```python
urlpatterns = router.urls + [
    path("leaderboard/", HostelViewSet.as_view({"get": "list"}), name="leaderboard"),
]
```

The leaderboard *is* "hostels ranked by score" — already exactly what `HostelViewSet` computes. Second view, second serializer = a second place for score logic to drift. One `list` action, two URLs, one source of truth. ✅ Verified live: `/api/leaderboard/` and `/api/hostels/` return byte-identical results.

### 🐢 Throttle scope is per-action, not per-view

```python
class MissionActionRateThrottle(UserRateThrottle):
    scope = "claim"

@action(..., throttle_classes=[MissionActionRateThrottle])
def claim(self, request, pk=None): ...
```

`throttle_classes` on an `@action` **replaces** the view's default throttle for that action. Claim/drop/complete all share one `claim` scope (`5/min`) — deliberately, so someone can't dodge the limit by alternating claim/drop/claim/drop.

### 🔑 JWT over session/basic auth

```python
DEFAULT_AUTHENTICATION_CLASSES = ['rest_framework_simplejwt.authentication.JWTAuthentication']
```

Stateless (no server-side session store to reason about), and clean for both Postman (`{{access_token}}`) and the frontend (`fetch` + `Authorization: Bearer`) — no cookie jars, no CSRF dance. 30-min access token, 1-day refresh; `api.js` transparently retries a `401` once, after refreshing.

### 👤 `RegisterSerializer`: one serializer, two models

Registration creates a `User` *and* a `Participant` in one call:

```python
class RegisterSerializer(serializers.ModelSerializer):
    username = serializers.CharField(max_length=150, write_only=True, validators=[UniqueValidator(queryset=User.objects.all())])
    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = Participant
        fields = "__all__"
        read_only_fields = ["user"]

    @atomic
    def create(self, validated_data):
        user = User.objects.create_user(username=validated_data.pop("username"), password=validated_data.pop("password"))
        return Participant.objects.create(user=user, **validated_data)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["username"] = instance.user.username
        return data
```

Three lessons baked in (all real bugs, see the table below 👇):

- 🚫 `read_only_fields = ["user"]` — otherwise `fields = "__all__"` demands a `User` id *before* the `User` exists.
- ✍️ `write_only=True` on `username`/`password` — otherwise DRF tries `getattr(participant, "username")` while building the response and crashes, since it lives on `User`, not `Participant`. Added back by hand in `to_representation`.
- ⏱️ `@atomic` covers `create()` only — **not** response serialization. A crash after the transaction commits still leaves the rows behind.

### 📖 API docs via drf-spectacular

`/api/schema/` + `/api/docs/` generate straight from the existing serializers/viewsets — no hand-maintained spec to drift out of sync.

### 🚧 The frontend never re-implements backend rules

Claim/Drop/Complete buttons are always shown when logged in, regardless of mission state — a click just calls the API and shows whatever the backend says (`409`, `403`, ...). The backend never even exposes *which user* owns a `Participant`, so the frontend genuinely can't guess ownership client-side — and shouldn't try. **Backend enforces. Frontend reflects.**

`src/api.js` centralizes JWT storage and does one transparent retry-after-refresh on `401`, so no page has to think about token lifecycle.

### 🌐 CORS is allow-listed, not wide open

```python
CORS_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']
```

Scoped to exactly the Vite dev origin — no reason a competition backend needs `CORS_ALLOW_ALL_ORIGINS`.

### 🧪 The Postman collection

Nothing is hardcoded — every id, username, and token is captured by one request's test script and referenced by later ones as `{{variable}}`. Usernames are timestamp-suffixed, so re-running the whole collection never collides with the last run.

Folder order is deliberate: `0. Setup` → `1. Documentation` (early, before anonymous reads eat the throttle budget) → `2. Auth` → ... → `10. Rate Limiting` (last — it exists to burn the mission's throttle budget) → `11. Cleanup`. Learned the hard way, by running it for real and watching it fail. 🔁

---

## 🐞 Bugs found and fixed along the way

Every one of these was caught by actually running the code — a shell repro, a live `curl`, a Newman run — not by reading it:

| 🐛 Bug | 💥 Symptom | 🩹 Fix |
|---|---|---|
| `HostelViewSet.queryset` missing `Coalesce` | `TypeError` on any hostel with zero cracked missions | Wrapped in `Coalesce(Sum(...), 0)` |
| `Mission.complete()` — 3 iterations to get right | `AttributeError`, then wrong object type stored | `Participant.objects.only("hostel_id").get(id=user_id).hostel_id` |
| Missing migration for `completed_hostel` | `OperationalError: no such column` | `makemigrations` + `migrate` |
| `RegisterSerializer` response crash | `AttributeError` — `username` had no `source` | `write_only=True` + `to_representation` override |
| `RegisterSerializer` demanded a `user` id | `fields = "__all__"` auto-required it | `read_only_fields = ["user"]` |
| `HostelSerializer` — every field read-only | `POST`/`PATCH` returned 200/201 but silently wrote nothing | Narrowed `read_only_fields` to just the derived fields |
| Postman generator dropped the trailing slash | Every `POST` 500'd on Django's `APPEND_SLASH` guard | Preserved it as a trailing empty path segment |
| Postman generator — shared JS scope | `SyntaxError: Identifier already declared` across requests | Wrapped every script in an IIFE |

---

## 📡 API reference

All endpoints live under `/api/` unless noted. Auth header: `Authorization: Bearer <access_token>`.

| 🔧 Method | 🛣️ Path | 🔐 Auth | 📝 Notes |
|---|---|---|---|
| `POST` | `/auth/api/register/` | none | creates `User` + `Participant` |
| `POST` | `/api/auth/token/` | none | JWT login |
| `POST` | `/api/auth/token/refresh/` | none | |
| `GET`/`POST`/`PATCH`/`DELETE` | `/api/missions/`, `/api/missions/{id}/` | read: none · write: staff | `?status=` `?difficulty=` `?hostel=` `?search=` `?page=` |
| `POST` | `/api/missions/{id}/claim/` | 🧑 participant | throttled — `claim` scope |
| `POST` | `/api/missions/{id}/drop/` | 🧑 participant (owner) | throttled — `claim` scope |
| `POST` | `/api/missions/{id}/complete/` | 🧑 participant (owner) | throttled — `claim` scope |
| `GET`/`POST`/`PATCH`/`DELETE` | `/api/hostels/`, `/api/hostels/{id}/` | read: none · write: staff | |
| `GET` | `/api/leaderboard/` | none | 🥇 same data as `/api/hostels/`, aliased |
| `GET` | `/api/participants/`, `/api/participants/{id}/` | participant or staff | read-only |
| `GET` | `/api/docs/` | none | 📖 Swagger UI |
| `GET` | `/api/schema/` | none | raw OpenAPI schema |

---

## 🕳️ Known gaps

- 🧪 No automated test suite — deliberately deprioritized in favor of live shell/curl/Newman verification at each step (see the 🐞 bug table above for what that caught in practice).
