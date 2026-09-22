# Operation Golden Keyboard

A hostel-vs-hostel mission competition backend, built with Django REST Framework. Hostels compete to crack missions; a participant claims a mission, completes it, and the points flow straight to their hostel's leaderboard score. See [`TASK.md`](TASK.md) for the original spec.

- **Backend**: Django 6 + DRF, JWT auth, SQLite.
- **Frontend**: React + Vite, in [`frontend/`](frontend/).
- **API tests**: a Postman collection + environment, in [`postman/`](postman/).

---

## Table of contents

- [Quickstart](#quickstart)
- [Project layout](#project-layout)
- [Data model](#data-model)
- [Design decisions](#design-decisions)
  - [Score is derived, never stored](#score-is-derived-never-stored)
  - [A denormalized `completed_hostel` FK](#a-denormalized-completed_hostel-fk)
  - [Claim / drop / complete are atomic, filtered updates](#claim--drop--complete-are-atomic-filtered-updates)
  - [Status is a computed property, not a column](#status-is-a-computed-property-not-a-column)
  - [Permissions are three small composable classes](#permissions-are-three-small-composable-classes)
  - [Filtering a computed field with a custom `FilterSet`](#filtering-a-computed-field-with-a-custom-filterset)
  - [The leaderboard reuses `HostelViewSet`, verbatim](#the-leaderboard-reuses-hostelviewset-verbatim)
  - [Throttle scope is per-action, not per-view](#throttle-scope-is-per-action-not-per-view)
  - [JWT over session/basic auth](#jwt-over-sessionbasic-auth)
  - [`RegisterSerializer`: a model serializer for two models](#registerserializer-a-model-serializer-for-two-models)
  - [API docs via drf-spectacular](#api-docs-via-drf-spectacular)
  - [The frontend never re-implements backend rules](#the-frontend-never-re-implements-backend-rules)
  - [CORS is allow-listed to the Vite dev origin](#cors-is-allow-listed-to-the-vite-dev-origin)
  - [Postman collection: self-seeding and idempotent](#postman-collection-self-seeding-and-idempotent)
- [Bugs found and fixed along the way](#bugs-found-and-fixed-along-the-way)
- [API reference](#api-reference)
- [Known gaps](#known-gaps)

---

## Quickstart

```bash
# Backend
uv sync
uv run python manage.py migrate
uv run python manage.py seed_hostels          # seeds the 17 BITS Pilani hostels
uv run python manage.py createsuperuser       # needed for any staff-only request
uv run python manage.py runserver             # http://127.0.0.1:8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                                   # http://localhost:5173
```

API docs (Swagger UI): `http://127.0.0.1:8000/api/docs/`. Raw OpenAPI schema: `/api/schema/`.

To exercise the API without the frontend, import `postman/golden_keyboard.postman_collection.json` and its paired environment into Postman — see [Postman collection](#postman-collection-self-seeding-and-idempotent) below for how to run it.

---

## Project layout

```
config/           Django project: settings, root urls
mission/          Mission model, permissions, filters, viewset
participant/      Hostel + Participant models, register/hostel/participant viewsets
frontend/         React + Vite SPA
postman/          Postman collection + environment
TASK.md           Original spec
```

---

## Data model

```
Hostel (name)
  └─< Participant (handle, user 1-1, hostel FK)
                     └─< Mission.claimed_by      (1-1, nullable — a participant can hold at most one mission)
                     └─< Mission.completed_by    (FK, nullable)
Hostel
  └─< Mission.completed_hostel  (FK, nullable — see "denormalized FK" below)
```

A `Mission` never stores its own score contribution anywhere but its own `points` field. Everything downstream (status, hostel score, leaderboard) is derived from that plus the FK state.

---

## Design decisions

### Score is derived, never stored

The task is explicit that hostel score must never be manually incremented — it has to come from aggregating cracked missions. `HostelViewSet.queryset` (`participant/views.py`) does exactly that:

```python
Hostel.objects.annotate(score=Coalesce(Sum("cracked_missions__points"), 0)).order_by("-score", "name")
```

`Sum` over a hostel with **zero** cracked missions returns SQL `NULL`, which becomes Python `None` — and `serializers.IntegerField.to_representation(None)` raises `TypeError`. `Coalesce(..., 0)` closes that gap. This one-line omission was caught and fixed mid-session by reproducing the crash in a shell (`HostelSerializer(qs, many=True).data` on a hostel with no cracked missions), not by inspection alone.

### A denormalized `completed_hostel` FK

Originally, "which hostel cracked mission X" could only be derived two hops away: `Mission.completed_by.hostel`. That's fine for a single mission, but `HostelSerializer.get_cracked_missions` and the leaderboard's score aggregate both need it *per hostel, for every hostel, every request* — a two-hop join (`Sum("participants__completed_missions__points")`) repeated across N hostels risks turning into real N+1-shaped query cost as the join fans out.

The fix: `Mission.completed_hostel` is a second FK, set once, at the moment a mission is completed, alongside `completed_by`:

```python
def complete(self, user_id):
    qs = self.__class__.objects.filter(pk=self.pk, claimed_by_id=user_id, completed_by__isnull=True, deadline__gt=now())
    hostel_id = Participant.objects.only("hostel_id").get(id=user_id).hostel_id
    return qs.update(completed_by_id=user_id, claimed_by=None, completed_hostel_id=hostel_id)
```

This turns both the score aggregate and `cracked_missions` into a single-hop `related_name="cracked_missions"` lookup:

```python
Sum("cracked_missions__points")                      # HostelViewSet.queryset
obj.cracked_missions.order_by("-points").values(...)  # HostelSerializer.get_cracked_missions
```

It's a deliberate normalization trade-off: `completed_hostel` is redundant with `completed_by.hostel` (and could theoretically drift if a participant's hostel changed after the fact — participants can't currently change hostels, so this isn't reachable in practice). In exchange, both hot-path reads become one JOIN instead of two. This went through several other resolutions first — a `Prefetch(..., to_attr=...)` approach was considered and explained in detail before this denormalization approach was chosen instead — see [Bugs found and fixed](#bugs-found-and-fixed-along-the-way) for what went wrong while wiring it up.

### Claim / drop / complete are atomic, filtered updates

Each mission action is a single `UPDATE ... WHERE ...` statement, not a read-then-write:

```python
def claim(self, user_id):
    return self.__class__.objects.filter(
        pk=self.pk, completed_by__isnull=True, claimed_by__isnull=True, deadline__gt=now()
    ).update(claimed_by_id=user_id)
```

The method returns the number of rows affected (`0` or `1`). The view checks that count, not the mission's in-memory state:

```python
if not mission.claim(request.user.participant.pk):
    return Response({"detail": "Mission is not available to claim."}, status=status.HTTP_409_CONFLICT)
```

This is what makes "two participants can't both successfully claim the same mission" true under concurrency, not just in the happy path: the `WHERE claimed_by__isnull=True` is evaluated by the database as part of the same atomic statement that sets `claimed_by_id`, so a second concurrent claim's `UPDATE` simply matches zero rows — there's no window between "check if claimed" and "set claimed" for a race to land in. The same pattern enforces ownership (`claimed_by_id=user_id` in the `WHERE`) and the deadline (`deadline__gt=now()` in the `WHERE`) for free, at the same atomicity.

### Status is a computed property, not a column

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

The task explicitly calls out that "a mission might still have `unclaimed` stored in the database even though its deadline has already passed" and that claim/status-change attempts must check the *real* deadline, not the stored status. Storing `status` as a column would mean either a background job to flip it at deadline time, or every read re-deriving it anyway to catch the gap — so it's never stored at all. It's computed fresh on every access from `completed_by`, `claimed_by`, and `deadline`, which are the only three pieces of state that actually exist. `Status` is a plain class of string constants (not `models.TextChoices`) precisely because it isn't backing a model field.

### Permissions are three small composable classes

```python
class IsReadOnly(BasePermission):
    def has_permission(self, request, view):
        return request.method in SAFE_METHODS

class IsStaff(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user.is_staff)

class IsParticipant(BasePermission):
    def has_permission(self, request, view):
        return hasattr(request.user, "participant")
```

`MissionViewSet` and `HostelViewSet` both use `permission_classes = [IsReadOnly | IsStaff]` — anyone can read, only staff can write through the generic CRUD endpoints. This is what makes "participants should not be able to modify core mission details" true without any field-level logic: a participant's `PATCH`/`PUT`/`DELETE` never even reaches the serializer, because `IsReadOnly` is false (it's a write) and `IsStaff` is false (they're not staff) — DRF returns `403` before the view runs.

Claim/drop/complete are the *only* way a participant touches a mission, and each of those `@action`s overrides `permission_classes=[IsParticipant]` for just that action. Ownership itself (can *this* participant modify *this* mission) is enforced by the `claimed_by_id=user_id` filter inside `claim`/`drop`/`complete` described above, not by a permission class — a permission class only knows about the request and the view, not "is this the participant who claimed this specific mission," so that check belongs with the query that would act on it.

### Filtering a computed field with a custom `FilterSet`

`django-filter`'s usual `filterset_fields = [...]` shortcut only works on real database columns. `status` isn't one — it's the property above — so `?status=unclaimed` needed a method filter that reconstructs the same logic as the property, but as a queryset `WHERE` clause instead of a Python branch on an already-loaded instance:

```python
class MissionFilter(django_filters.FilterSet):
    status = django_filters.ChoiceFilter(choices=[...], method="filter_status")
    hostel = django_filters.NumberFilter(method="filter_hostel")

    class Meta:
        model = Mission
        fields = ["status", "difficulty", "hostel"]

    def filter_status(self, queryset, name, value):
        current = now()
        if value == Status.UNCLAIMED:
            return queryset.filter(completed_by__isnull=True, claimed_by__isnull=True, deadline__gt=current)
        # ...
```

`hostel` needed the same treatment for a different reason: there's no single FK that means "this mission's hostel" across all states — an in-progress mission's hostel comes from `claimed_by__hostel`, a cracked one's from `completed_hostel`, and an unclaimed one has none. `filter_hostel` reflects that with an `OR` across both paths rather than pretending a single field covers it:

```python
def filter_hostel(self, queryset, name, value):
    return queryset.filter(Q(claimed_by__hostel_id=value) | Q(completed_hostel_id=value))
```

`difficulty` is a real column, so it's left in `Meta.fields` to get django-filter's default exact-match filter for free — no reason to hand-write what already works.

### The leaderboard reuses `HostelViewSet`, verbatim

`GET /api/leaderboard/` is not a new view:

```python
urlpatterns = router.urls + [
    path("leaderboard/", HostelViewSet.as_view({"get": "list"}), name="leaderboard"),
]
```

The leaderboard *is* "hostels ranked by score" — that's already exactly what `HostelViewSet.queryset` computes and orders. Writing a second serializer/view for the same query would just be a second place for the score logic to drift out of sync. Binding a second URL to the same `list` action keeps one source of truth; verified live that `/api/leaderboard/` and `/api/hostels/` return byte-identical `results`.

### Throttle scope is per-action, not per-view

```python
class MissionActionRateThrottle(UserRateThrottle):
    scope = "claim"

@action(..., throttle_classes=[MissionActionRateThrottle])
def claim(self, request, pk=None): ...
```

`throttle_classes` on an `@action` **replaces** the view's default throttles for that action rather than adding to them, so `claim`/`drop`/`complete` are governed only by the `claim` scope (`5/min`), not also counted against the general `user` scope (`60/min`) that every other authenticated endpoint uses. All three share one scope (rather than one throttle each) deliberately: the risk being guarded against is "someone hammering mission-state-changing endpoints," and a participant could otherwise dodge a per-action limit by alternating claim/drop/claim/drop.

### JWT over session/basic auth

`DEFAULT_AUTHENTICATION_CLASSES = ['rest_framework_simplejwt.authentication.JWTAuthentication']` replaces DRF's default session+basic auth entirely. Two reasons: it's stateless (no server-side session store to reason about for a competition-scale API), and it's what makes the throttle and Postman/frontend stories clean — a `Bearer` token is trivial to attach from Postman's `{{access_token}}` variable or the frontend's `fetch` wrapper, whereas session auth would need cookie jars and CSRF handling on both. `SIMPLE_JWT` sets a 30-minute access token and a 1-day refresh token; the frontend's `api.js` transparently retries a `401` once after refreshing.

### `RegisterSerializer`: a model serializer for two models

Registration has to create both a `User` (for auth) and a `Participant` (for the competition) in one call. `RegisterSerializer` is a `ModelSerializer` on `Participant`, with `username`/`password` bolted on as extra fields that don't exist on that model:

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

Two non-obvious details here, both bugs in earlier drafts (see [below](#bugs-found-and-fixed-along-the-way)):

- `read_only_fields = ["user"]` — `Participant.user` is a required, non-nullable FK, so `fields = "__all__"` would otherwise auto-generate it as a *required input field*, meaning callers would need to already have a `User` id before registering one. Marking it read-only stops DRF from demanding it as input; `create()` never reads it from `validated_data` anyway, since it builds the `User` explicitly.
- `username`/`password` are `write_only=True`, and `to_representation` adds `username` back in by hand from `instance.user.username`. Without `write_only`, DRF's default field loop tries `getattr(participant_instance, "username")` while building the *response* — which fails, because `username` lives on the related `User`, not on `Participant`. `write_only` skips it from that loop; the override adds it back from the right object. `password` stays `write_only` with nothing added back — it should never appear in a response at all.
- `@atomic` covers only `create()`, not the response-serialization step — a lesson learned when an earlier version's `to_representation` crash turned out to still have committed the `User`/`Participant` rows, because the crash happened *after* the atomic block returned.

### API docs via drf-spectacular

`SPECTACULAR_SETTINGS` + two routes (`/api/schema/`, `/api/docs/`) generate the OpenAPI schema and Swagger UI straight from the existing serializers/viewsets — no hand-maintained spec to keep in sync with the code.

### The frontend never re-implements backend rules

The frontend (`frontend/`) deliberately does **not** re-implement any competition rule. `MissionCard`'s Claim/Drop/Complete buttons are always shown when logged in, regardless of mission state or who claimed it — the click just calls the API and surfaces whatever error the backend returns (`409`, `403`, etc.) in place. The alternative — hiding buttons based on client-side guesses about ownership — was rejected because the DRF `ParticipantSerializer` never even exposes which `User` a `Participant` belongs to (deliberately: `ParticipantSerializer.fields` is a fixed, read-only list that doesn't leak `user`), so the frontend has no reliable way to know "is this mission mine" without asking the backend. Consistent with the rest of this project: the backend enforces the rules, the frontend just reflects the outcome.

`src/api.js` centralizes JWT storage (`localStorage`) and does one transparent retry-after-refresh on a `401`, so every page's calls (`api.claimMission(id)`, etc.) don't each need to know about token lifecycle.

### CORS is allow-listed to the Vite dev origin

```python
CORS_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']
```

Scoped to exactly the Vite dev server's origin rather than `CORS_ALLOW_ALL_ORIGINS = True`, since there's no reason a competition backend needs to accept cross-origin requests from arbitrary sites.

### Postman collection: self-seeding and idempotent

The collection (`postman/golden_keyboard.postman_collection.json`) doesn't hardcode any IDs, usernames, or tokens — every value it needs (`hostel_id`, `participant_a_id`, `mission_id`, `access_token_a`, ...) is captured into the paired environment by an earlier request's test script and referenced by later ones as `{{variable}}`. Usernames/handles are timestamp-suffixed in pre-request scripts (`'demo_a_' + Date.now()`), so re-running the whole collection never collides with a previous run's data on the unique constraints.

Folder order matters and is deliberate, not alphabetical: `0. Setup` (grab real hostel ids) → `1. Documentation` (run early, before other folders' anonymous reads eat into the `anon: 20/min` quota) → `2. Auth` → ... → `10. Rate Limiting` (intentionally last among the functional folders, since it exists specifically to run the shared mission out of throttle budget) → `11. Cleanup`. This ordering, and the decision to authenticate the filtering/search/pagination requests rather than leave them anonymous, both came directly out of running the collection for real against the live server and watching it fail — see below.

---

## Bugs found and fixed along the way

These were each caught by actually exercising the code (a Django shell repro, a live `curl`/Newman run) rather than by inspection, and fixed once confirmed:

| Bug | Symptom | Fix |
|---|---|---|
| `HostelViewSet.queryset` missing `Coalesce` | `TypeError` serializing any hostel with zero cracked missions (`Sum` of an empty group is `NULL`) | Wrapped in `Coalesce(Sum(...), 0)` |
| `Mission.complete()` resolved the wrong model / wrong attribute across 3 iterations | `AttributeError` (`User` has no `hostel_id`), then a `Participant` *instance* stored where a scalar id was needed | `Participant.objects.only("hostel_id").get(id=user_id).hostel_id` |
| Missing migration for `completed_hostel` | `OperationalError: no such column: mission_mission.completed_hostel_id` | `makemigrations` + `migrate` |
| `RegisterSerializer` response crash | `AttributeError` building the response — `username` had no `source`, and DRF tried reading it straight off the `Participant` instance | `write_only=True` on `username`, added back via `to_representation` |
| `RegisterSerializer` demanded a `user` id as input | `fields = "__all__"` auto-generated `user` as a required `PrimaryKeyRelatedField` | `read_only_fields = ["user"]` |
| `HostelSerializer` — every field read-only | `POST`/`PATCH` on `/api/hostels/` returned `200`/`201` but silently never wrote `name` | `read_only_fields` narrowed to just the derived fields (`score`, `cracked_missions`, timestamps) |
| Postman collection generator: dropped trailing slash | Every generated `POST` hit Django's `APPEND_SLASH` guard and 500'd, because Postman rebuilds the request URL from the `path` array, not the `raw` string | Preserved the trailing slash as a trailing empty path segment |
| Postman collection generator: shared JS scope | `SyntaxError: Identifier 'data' has already been declared` across unrelated requests — Newman's sandbox shares one global scope for the whole run | Wrapped every script in an IIFE |

---

## API reference

All endpoints are under `/api/` unless noted. Auth: `Authorization: Bearer <access_token>`.

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/auth/api/register/` | none | creates `User` + `Participant` |
| `POST` | `/api/auth/token/` | none | JWT login |
| `POST` | `/api/auth/token/refresh/` | none | |
| `GET`/`POST`/`PATCH`/`DELETE` | `/api/missions/` , `/api/missions/{id}/` | read: none · write: staff | `?status=`, `?difficulty=`, `?hostel=`, `?search=`, `?page=` |
| `POST` | `/api/missions/{id}/claim/` | participant | throttled, `claim` scope |
| `POST` | `/api/missions/{id}/drop/` | participant (owner) | throttled, `claim` scope |
| `POST` | `/api/missions/{id}/complete/` | participant (owner) | throttled, `claim` scope |
| `GET`/`POST`/`PATCH`/`DELETE` | `/api/hostels/`, `/api/hostels/{id}/` | read: none · write: staff | |
| `GET` | `/api/leaderboard/` | none | same data as `/api/hostels/`, aliased |
| `GET` | `/api/participants/`, `/api/participants/{id}/` | participant or staff | read-only |
| `GET` | `/api/docs/` | none | Swagger UI |
| `GET` | `/api/schema/` | none | raw OpenAPI schema |

---

## Known gaps

- No automated test suite (deliberately deprioritized during this build in favor of live shell/curl/Newman verification at each step — see the bug table above for what that caught).
