# **Operation Golden Keyboard**

Same competition, but this time we're taking the backend a step further.

Operation Golden Keyboard is now a campus-wide competition where multiple hostels are competing against each other. We need to keep track of participants, missions, which hostel is solving what, and the live leaderboard.

This task assumes you already know basic Django REST Framework CRUD. The focus here is on **database relationships, permissions, validation, filtering, throttling, and building APIs that properly enforce the competition rules.**

## **1\. Database Design**

Design the database around three main entities:

* Hostels  
* Participants  
* Missions

The system should maintain a proper relationship between participants and their hostel, and between missions and the participant who claims them.

Each participant should have:

* A unique handle  
* A hostel they belong to  
* A connection to Django's built-in `User` model

Each mission should contain the same basic information as the previous task:

* Codename  
* Brief  
* Points  
* Difficulty  
* Status  
* Deadline

However, missions should now also keep track of:

* Which participant claimed the mission  
* Which hostel that mission belongs to

The hostel associated with a claimed mission should come from the participant who claimed it. It should not be something a participant can manually set.

The mission status should support:

* `unclaimed`  
* `in_progress`  
* `cracked`  
* `expired`

The hostel list should contain the 17 BITS Pilani hostels from the previous task.

Do not manually maintain the hostel's score as the source of truth. The score should be derived from the missions that the hostel has successfully cracked.

## **2\. Related Serializers**

Build serializers that make the relationships useful to an API client.

A mission response should show meaningful information about its claimant and hostel instead of only returning foreign key IDs.

For example, a client should be able to see the participant's handle and their hostel when retrieving a mission.

Similarly, the hostel detail API should provide:

* Hostel information  
* Its current score  
* The missions that have been cracked by that hostel

Use nested or related serializers wherever appropriate.

## **3\. Leaderboard**

Create:

GET /api/leaderboard/

The endpoint should return all hostels ranked by their current score.

The score must be calculated from the missions in the database using Django ORM aggregation.

Do not manually increment or decrement hostel points whenever a mission is solved.

Only missions whose status is `cracked` should contribute their points to the leaderboard.

The leaderboard should therefore always represent the current state of the missions.

## **4\. Permissions and Competition Rules**

Implement custom DRF permissions and validation for the competition.

Do not simply use generic authentication permissions and assume the frontend will handle the rest.

### **Mission ownership**

Only the participant who claimed a mission should be able to change its status to `in_progress` or `cracked`.

A participant should not be able to modify another participant's mission.

### **Claiming missions**

A mission can only be claimed if it is currently available.

A participant should not be able to claim a mission that is already:

* In progress  
* Cracked  
* Expired

The API must enforce this itself.

Two participants should not be able to successfully claim the same mission.

### **Editing missions**

Participants should not be able to modify the core details of a mission, such as:

* Codename  
* Brief  
* Points  
* Difficulty  
* Deadline

Participants should only be able to modify the fields that are relevant to their participation, such as claiming a mission or updating its status.

The hostel associated with a mission should never be directly editable by a participant.

## **5\. Deadline Handling**

A mission should automatically be treated as expired once its deadline has passed.

For example, a mission might still have `unclaimed` stored in the database even though its deadline has already passed.

In that situation, attempting to claim it should still fail.

The same applies to attempts to change the status of a mission after its deadline.

Make sure the API checks the actual deadline rather than relying only on the stored status.

## **6\. Filtering, Search and Pagination**

The missions endpoint:

GET /api/missions/

should support filtering by:

1. ?status=unclaimed  
     
2. ?difficulty=boss\_level  
     
3. ?hostel=\<id\>  
   

Add a `search` parameter that can search through the mission codename and brief.

For example:

/api/missions/?search=binary

The endpoint should also support pagination.

The page size should be configurable through Django REST Framework settings rather than being hardcoded into the view.

## **7\. Rate Limiting**

The mission claiming operation should have its own rate limit.

Use DRF throttling to limit a user to something such as:

5 claim attempts per minute

The purpose is to prevent someone from continuously sending automated claim requests.

Once the limit is exceeded, the API should return:

429 Too Many Requests

This should be demonstrated through Postman.

## **8\. API Documentation**

Add automatically generated API documentation using a package such as `drf-spectacular` or `drf-yasg`.

The documentation should be available at:

/api/docs/

It should describe the available endpoints, parameters, serializers, request bodies, and expected responses.

## **9\. Postman Testing**

Create an exported Postman collection in `.json` format.

Use environment variables instead of hardcoding IDs and URLs.

For example:

4. {{base\_url}}  
5. {{mission\_id}}  
6. {{hostel\_id}}  
7. {{participant\_id}}  
   

The collection should demonstrate the important functionality of the API.

Include requests for:

* Mission CRUD  
* Hostel APIs  
* Participant APIs  
* Leaderboard  
* Mission filtering  
* Search  
* Pagination  
* Claiming a mission  
* Changing mission status  
* Permission failures  
* Invalid claims  
* Expired missions  
* Rate limiting

Include both successful and failing requests.

At minimum, demonstrate cases such as:

8. Participant claims an available mission → Success  
9. Participant tries to claim an already claimed mission → Failure  
10. Participant tries to modify another participant's mission → Failure  
11. Participant tries to edit mission points → Failure  
12. Staff edits mission information → Success  
13. Participant tries to claim an expired mission → Failure  
14. Repeated claim attempts → 429  
    

## **10\. Deliverables**

Submit:

1. Complete Django \+ Django REST Framework project  
2. Properly related Hostel, Participant and Mission data models  
3. DRF serializers for the related entities  
4. Full Mission CRUD API  
5. Hostel and Participant APIs  
6. Computed leaderboard endpoint  
7. Custom permission classes  
8. Mission state validation  
9. Deadline validation  
10. Filtering, search and pagination  
11. DRF throttling for mission claims  
12. Auto-generated API documentation at `/api/docs/`  
13. Exported Postman collection as `.json`  
14. Postman environment variables  
15. Tests covering the major success and failure cases

The main goal is to build an API that understands and enforces the rules of the competition.

Do not rely on the frontend to prevent invalid claims, unauthorized updates, expired missions, or incorrect leaderboard scores. The backend should be responsible for maintaining the integrity of the competition.

