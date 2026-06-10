# Sonar Bharat Firestore Security Specification

This security specification details the access control constraints, data invariants, and rogue validation payloads ("Dirty Dozen") designed to stress-test our Firestore security logic.

## 1. Data Invariants

1. **Owner Integrity**: A user can only submit reports under their own authentic Firebase `userId`.
2. **Immutability of Key Fields**: Once a report is created, fields like `id`, `userId`, `userEmail`, and `createdAt` cannot be altered.
3. **Strict Category Selection**: The category field must belong strictly to one of our allowed categories: Potholes, Broken Roads, Water Logging, Garbage Dump, Damaged Traffic Signal, Street Light Not Working, Drain Blockage, Fallen Trees, or Others.
4. **Status Lifecycle Control (Admin Only / Safe State)**: Standard users cannot arbitrarily mark an issue as "Resolved" or "Rejected" without admin authority, or they can only update standard upvote collections. No user can change standard report statuses unless authorized or restricted to "Pending" on creation.
5. **Vote Double-Spam Guard**: A user can only write a vote document under `/reports/{reportId}/votes/{voteId}` where `{voteId}` matches their own `userId` to prevent them from voting more than once on the same issue.

## 2. The "Dirty Dozen" Rogue Payloads (Identity, Integrity, and State Violations)

Below are the 12 rogue payloads designed to breach our system rules, which must be rejected with `PERMISSION_DENIED`.

### Pillar 1: Identity Spoofing Attacks
1. **The Spoofed Reporter**: Creating a report with a different user's `userId`.
2. **Unauthenticated Submission**: Submitting a report without any authenticated session active.
3. **The Unverified Submitter**: Submitting a report when `request.auth.token.email_verified` is `false` (requiring email verification for true non-anonymous accountability).

### Pillar 2: Schema & Value Poisoning
4. **Huge Description Attack**: Injecting a description greater than 10,000 characters to bloat database storage.
5. **Invalid Category Attack**: Injecting a non-existent category like `"Potholes Pro"`.
6. **Ghost Field Injection**: Adding an unrequested field like `"isGovernmentAdmin": true` inside the report mapping.
7. **Negative Coordinates Attack**: Submitting latitude or longitude coordinates that are out of bounds or malformed strings.

### Pillar 3: Status & State Shortcutting
8. **Instant Resolution Shortcut**: Submitting a new issue directly with `"status": "Resolved"` to bypass worker verification.
9. **Malicious Transition**: A normal user updating the status of an existing complaint from `"Pending"` to `"Resolved"`.

### Pillar 4: Temporal and Numerical Exploits
10. **Spoofed Created-At Timestamp**: Sending a client-fabricated `createdAt` date in the past or future instead of using `request.time`.
11. **Malicious Upvote Bloating**: A user updating the `upvotesCount` field directly on a report (e.g. adding +1000 votes) instead of submitting a single vote document to the `/votes` subcollection.

### Pillar 5: Duplicate Voting & Voter Forgery
12. **The Spam Vote**: A user writing a vote document for another user's ID under the `/reports/{reportId}/votes/{anotherUserId}` path.

---
All of these attacks are locked out of the "Fortress" ruleset.
