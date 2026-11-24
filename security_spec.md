# After AI Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Strict User Ownership**: Every document under `/users/{userId}`, `/users/{userId}/chats/{chatId}`, `/users/{userId}/chats/{chatId}/messages/{messageId}`, and `/users/{userId}/creations/{creationId}` belongs strictly to `request.auth.uid == userId` with `request.auth.token.email_verified == true`.
2. **No Cross-Tenant Reads or Lists**: Unauthenticated users and other authenticated users cannot read, list, create, update, or delete another user's profile, chats, messages, or creations.
3. **Referential Integrity**: A `ChatMessage` cannot exist without an existing parent `ChatSession` owned by the same `userId`.
4. **Immutable Ownership & Timestamps**: `uid`, `userId`, `chatId`, `id`, and `createdAt` cannot be modified after creation; `createdAt` and `updatedAt` must equal `request.time`.
5. **Volumetric & Type Bounds**: All IDs match `^[a-zA-Z0-9_\-]+$` (`<= 128` chars), strings are size-bounded, `mapsLinks` lists are bounded (`<= 10` items), and unknown/ghost fields are rejected via `hasOnly()`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Write**: Create `/users/u1` with `auth: null` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: Create `/users/u1` with `auth: { uid: 'u1', token: { email_verified: false } }` -> `PERMISSION_DENIED`.
3. **Cross-User Profile Hijack**: Authenticated `u2` reads or updates `/users/u1` -> `PERMISSION_DENIED`.
4. **Shadow/Ghost Field Injection**: Create `/users/u1` including `{ isAdmin: true, role: 'superadmin' }` -> `PERMISSION_DENIED`.
5. **Owner Spoofing in Subcollection**: `u1` creates `/users/u1/chats/c1` with `userId: 'u2'` -> `PERMISSION_DENIED`.
6. **Oversized ID Poisoning**: Create `/users/u1/chats/<200-char-invalid-id>` or spaces/slashes -> `PERMISSION_DENIED`.
7. **Forged Client Timestamp**: Create `/users/u1/chats/c1` with `createdAt: new Date('2020-01-01')` instead of `request.time` -> `PERMISSION_DENIED`.
8. **Immutable Field Mutation**: Update `/users/u1/chats/c1` attempting to change `createdAt` or `userId` -> `PERMISSION_DENIED`.
9. **Orphaned Message Write**: Create `/users/u1/chats/nonexistent/messages/m1` -> `PERMISSION_DENIED`.
10. **Unbounded Array / Resource Exhaustion**: Create message with `mapsLinks` array of 25 items (`> 10`) -> `PERMISSION_DENIED`.
11. **Value Type Poisoning**: Update `/users/u1/chats/c1` setting `model: "gpt-4o"` (disallowed enum) or `title: 12345` -> `PERMISSION_DENIED`.
12. **Cross-Tenant List Scraping**: Authenticated `u2` runs `list` query on `/users/u1/chats` -> `PERMISSION_DENIED`.
