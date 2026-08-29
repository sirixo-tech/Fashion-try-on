# SelfX Public API

This guide documents the first developer-facing SelfX Public API surface.

The Public API is a governed subset of SelfX. External applications authenticate with scoped SelfX API keys and call SelfX only. Clients must never call FASHN, Google Virtual Try-On or other AI providers directly with provider credentials.

## Base URL

Use the deployed SelfX API origin for the environment you are integrating with.

```text
https://api.selfx.example
```

All endpoints below are versioned under:

```text
/api/v1/public
```

## Authentication

Send the API key on every request using the preferred header:

```http
x-selfx-api-key: selfx_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Also supported:

```http
x-api-key: selfx_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Authorization: Bearer selfx_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

API keys are scoped and tied to one Store. A key can only access sessions, uploads, runs and usage for its Store.

## Scopes

| Scope | Allows |
| --- | --- |
| `tryon:create` | Upload person/garment images and create Try-On runs |
| `tryon:read` | Poll Try-On run status and retrieve signed result URLs |
| `usage:read` | Read usage rollups for the current API key |
| `webhooks:manage` | Create, update, disable and list webhook endpoints |

## Retention And Privacy

Public API person images, garment uploads and generated result assets follow SelfX sensitive-image retention rules. These assets are session-bound and expire no later than the active SelfX retention period.

Responses do not expose provider credentials, provider prediction IDs, raw Base64 images or unrestricted public asset URLs. Completed result responses return SelfX result download URLs that require the same Public API key and stream the image as an attachment.

## 1. Inspect Credential

Use this endpoint to confirm that a key is valid and see its Store context.

```bash
curl -sS \
  -H "x-selfx-api-key: $SELFX_API_KEY" \
  https://api.selfx.example/api/v1/public/me
```

Example response:

```json
{
  "authenticated": true,
  "keyPrefix": "selfx_test_abcd1234",
  "environment": "TEST",
  "scopes": ["tryon:create", "tryon:read", "usage:read"],
  "store": {
    "id": "0198a9b3-d0bc-7000-8000-000000000001",
    "name": "Demo Store"
  },
  "serverTime": "2026-08-29T12:00:00.000Z"
}
```

## 2. Upload Person Image

Upload the user/model image first. If `sessionId` is omitted, SelfX creates a Store-scoped Try-On session and makes this person image the current person for that session.

```bash
curl -sS \
  -X POST \
  -H "x-selfx-api-key: $SELFX_API_KEY" \
  -F "purpose=PERSON" \
  -F "image=@./person.png;type=image/png" \
  https://api.selfx.example/api/v1/public/uploads
```

Example response:

```json
{
  "sessionId": "0198a9b3-d0bc-7000-8000-000000000101",
  "assetId": "0198a9b3-d0bc-7000-8000-000000000201",
  "purpose": "PERSON",
  "contentType": "image/png",
  "sizeBytes": 245120,
  "width": 1080,
  "height": 1440,
  "expiresAt": "2026-09-05T12:00:00.000Z",
  "serverTime": "2026-08-29T12:00:00.000Z"
}
```

## 3. Upload Garment Image

Upload the garment into the same session.

```bash
curl -sS \
  -X POST \
  -H "x-selfx-api-key: $SELFX_API_KEY" \
  -F "purpose=GARMENT" \
  -F "sessionId=0198a9b3-d0bc-7000-8000-000000000101" \
  -F "image=@./garment.png;type=image/png" \
  https://api.selfx.example/api/v1/public/uploads
```

Example response:

```json
{
  "sessionId": "0198a9b3-d0bc-7000-8000-000000000101",
  "assetId": "0198a9b3-d0bc-7000-8000-000000000202",
  "purpose": "GARMENT",
  "contentType": "image/png",
  "sizeBytes": 185320,
  "width": 900,
  "height": 1200,
  "expiresAt": "2026-09-05T12:01:00.000Z",
  "serverTime": "2026-08-29T12:01:00.000Z"
}
```

Supported image types:

- `image/jpeg`
- `image/png`
- `image/webp`

Unsupported formats, corrupt images, MIME/signature mismatches and oversized files are rejected before generation.

## 4. Create Try-On

Create a Try-On run using uploaded assets. `clientRequestId` is required and idempotent per API key. If the same key sends the same `clientRequestId` again, SelfX returns the original run.

```bash
curl -sS \
  -X POST \
  -H "content-type: application/json" \
  -H "x-selfx-api-key: $SELFX_API_KEY" \
  -d '{
    "clientRequestId": "order-1001-look-1",
    "sessionId": "0198a9b3-d0bc-7000-8000-000000000101",
    "personAssetId": "0198a9b3-d0bc-7000-8000-000000000201",
    "garmentAssetId": "0198a9b3-d0bc-7000-8000-000000000202",
    "garmentIntent": "TOP",
    "category": "TOP",
    "garmentPhotoType": "FLAT_LAY",
    "generationProfile": "BALANCED"
  }' \
  https://api.selfx.example/api/v1/public/try-ons
```

Example queued response:

```json
{
  "id": "0198a9b3-d0bc-7000-8000-000000000301",
  "status": "QUEUED",
  "sessionId": "0198a9b3-d0bc-7000-8000-000000000101",
  "personAssetId": "0198a9b3-d0bc-7000-8000-000000000201",
  "garmentAssetId": "0198a9b3-d0bc-7000-8000-000000000202",
  "createdAt": "2026-08-29T12:02:00.000Z",
  "updatedAt": "2026-08-29T12:02:00.000Z"
}
```

Optional generation fields:

| Field | Values | Default |
| --- | --- | --- |
| `garmentIntent` | `AUTO`, `TOP`, `BOTTOM`, `ONE_PIECE`, `FULL_OUTFIT` | `AUTO` |
| `category` | `AUTO`, `TOP`, `BOTTOM`, `ONE_PIECE` | Derived from `garmentIntent` or `AUTO` |
| `garmentPhotoType` | `AUTO`, `FLAT_LAY`, `ON_MODEL` | `AUTO` |
| `generationProfile` | `PERFORMANCE`, `BALANCED`, `QUALITY` | `BALANCED` |
| `modelCoverage` | `UPPER_BODY`, `LOWER_BODY`, `FULL_BODY`, `UNKNOWN` | omitted |

## 5. Poll Try-On Status

Poll the run until it becomes `COMPLETED` or `FAILED`.

```bash
curl -sS \
  -H "x-selfx-api-key: $SELFX_API_KEY" \
  https://api.selfx.example/api/v1/public/try-ons/0198a9b3-d0bc-7000-8000-000000000301
```

Example completed response:

```json
{
  "id": "0198a9b3-d0bc-7000-8000-000000000301",
  "status": "COMPLETED",
  "sessionId": "0198a9b3-d0bc-7000-8000-000000000101",
  "personAssetId": "0198a9b3-d0bc-7000-8000-000000000201",
  "garmentAssetId": "0198a9b3-d0bc-7000-8000-000000000202",
  "createdAt": "2026-08-29T12:02:00.000Z",
  "updatedAt": "2026-08-29T12:02:18.000Z",
  "result": {
    "assetId": "0198a9b3-d0bc-7000-8000-000000000401",
    "readUrl": "https://api.selfx.example/api/v1/public/try-ons/0198a9b3-d0bc-7000-8000-000000000301/download",
    "contentType": "image/png",
    "sizeBytes": 312420,
    "width": 1080,
    "height": 1440,
    "expiresAt": "2026-09-05T12:02:18.000Z"
  }
}
```

Example failed response:

```json
{
  "id": "0198a9b3-d0bc-7000-8000-000000000301",
  "status": "FAILED",
  "sessionId": "0198a9b3-d0bc-7000-8000-000000000101",
  "createdAt": "2026-08-29T12:02:00.000Z",
  "updatedAt": "2026-08-29T12:03:30.000Z",
  "errorCode": "TRYON_FAILED",
  "errorMessage": "Try-On generation failed."
}
```

## 6. Read Usage

Usage is currently operational counting, not final billing calculation. Pricing and billing rules will be decided separately.

```bash
curl -sS \
  -H "x-selfx-api-key: $SELFX_API_KEY" \
  "https://api.selfx.example/api/v1/public/usage?range=7d&limit=10"
```

Example response:

```json
{
  "range": {
    "preset": "7d",
    "from": "2026-08-22T12:00:00.000Z",
    "to": "2026-08-29T12:00:00.000Z"
  },
  "store": {
    "id": "0198a9b3-d0bc-7000-8000-000000000001",
    "name": "Demo Store"
  },
  "keyPrefix": "selfx_test_abcd1234",
  "totals": {
    "runsCreated": 42,
    "queuedRuns": 1,
    "processingRuns": 2,
    "completedRuns": 37,
    "failedRuns": 2,
    "generatedLooks": 37,
    "downloadsCompleted": 8
  },
  "providerUsage": [
    {
      "provider": "fashn",
      "providerModel": "tryon-v1.6",
      "runsCreated": 42,
      "completedRuns": 37,
      "failedRuns": 2
    }
  ]
}
```

Supported usage query parameters:

| Parameter | Values |
| --- | --- |
| `range` | `today`, `7d`, `30d`, `90d`, `custom` |
| `from` | ISO timestamp, required for complete custom ranges |
| `to` | ISO timestamp, required for complete custom ranges |
| `limit` | 1 to 20 provider rows |

## 7. Manage Webhooks

Webhook endpoints let SelfX notify an integration when a Public API Try-On run
finishes. Webhook management requires the `webhooks:manage` scope.

Supported events:

- `try_on.completed`
- `try_on.failed`

Create an endpoint:

```bash
curl -sS \
  -X POST \
  -H "content-type: application/json" \
  -H "x-selfx-api-key: $SELFX_API_KEY" \
  -d '{
    "url": "https://merchant.example.com/selfx/webhooks",
    "subscribedEvents": ["try_on.completed", "try_on.failed"]
  }' \
  https://api.selfx.example/api/v1/public/webhooks
```

Example response:

```json
{
  "id": "0198a9b3-d0bc-7000-8000-000000000501",
  "url": "https://merchant.example.com/selfx/webhooks",
  "status": "ACTIVE",
  "subscribedEvents": ["try_on.completed", "try_on.failed"],
  "createdAt": "2026-08-29T12:00:00.000Z",
  "updatedAt": "2026-08-29T12:00:00.000Z",
  "secret": "whsec_DyYz6psXVO2u-SelfXExampleSecret"
}
```

The `secret` is shown only once when the endpoint is created. Store it securely
in the receiving integration.

List endpoints:

```bash
curl -sS \
  -H "x-selfx-api-key: $SELFX_API_KEY" \
  https://api.selfx.example/api/v1/public/webhooks
```

Update an endpoint:

```bash
curl -sS \
  -X PATCH \
  -H "content-type: application/json" \
  -H "x-selfx-api-key: $SELFX_API_KEY" \
  -d '{
    "enabled": true,
    "subscribedEvents": ["try_on.completed"]
  }' \
  https://api.selfx.example/api/v1/public/webhooks/0198a9b3-d0bc-7000-8000-000000000501
```

Disable an endpoint:

```bash
curl -sS \
  -X DELETE \
  -H "x-selfx-api-key: $SELFX_API_KEY" \
  https://api.selfx.example/api/v1/public/webhooks/0198a9b3-d0bc-7000-8000-000000000501
```

SelfX preserves delivery history when an endpoint is disabled.

## Webhook Delivery

SelfX sends JSON webhook events with stable event metadata and a signed payload.

Example payload:

```json
{
  "id": "0198a9b3-d0bc-7000-8000-000000000601",
  "type": "try_on.completed",
  "apiVersion": "2026-08-29",
  "createdAt": "2026-08-29T12:02:18.000Z",
  "data": {
    "object": "try_on",
    "run": {
      "id": "0198a9b3-d0bc-7000-8000-000000000301",
      "status": "COMPLETED",
      "sessionId": "0198a9b3-d0bc-7000-8000-000000000101",
      "personAssetId": "0198a9b3-d0bc-7000-8000-000000000201",
      "garmentAssetId": "0198a9b3-d0bc-7000-8000-000000000202",
      "createdAt": "2026-08-29T12:02:00.000Z",
      "updatedAt": "2026-08-29T12:02:18.000Z",
      "result": {
        "assetId": "0198a9b3-d0bc-7000-8000-000000000401",
        "readUrl": "https://api.selfx.example/api/v1/public/try-ons/0198a9b3-d0bc-7000-8000-000000000301/download",
        "contentType": "image/png",
        "expiresAt": "2026-09-05T12:02:18.000Z"
      }
    }
  }
}
```

Webhook requests include these headers:

| Header | Meaning |
| --- | --- |
| `selfx-event-id` | Stable SelfX event ID |
| `selfx-event-type` | Event type, such as `try_on.completed` |
| `selfx-delivery-id` | Delivery attempt ID |
| `selfx-api-version` | Public API event version |
| `selfx-timestamp` | Unix timestamp in seconds |
| `selfx-signature` | `v1=` HMAC-SHA256 signature |

To verify a delivery, compute HMAC-SHA256 using the endpoint secret over:

```text
selfx-timestamp + "." + raw_request_body
```

The result must match the hex value after `v1=` in `selfx-signature`.

## Result Downloads

Completed Try-On responses include a `result.readUrl` that points to SelfX:

```text
/api/v1/public/try-ons/:runId/download
```

Call it with a Public API key that has `tryon:read`.

```bash
curl -L \
  -H "x-selfx-api-key: $SELFX_API_KEY" \
  -o selfx-look.png \
  https://api.selfx.example/api/v1/public/try-ons/0198a9b3-d0bc-7000-8000-000000000301/download
```

SelfX streams the result with `Content-Disposition: attachment` and records a single `PUBLIC_API_DOWNLOAD_COMPLETED` usage event per API key and Try-On run.

## Error Shape

SelfX API errors use a stable JSON envelope.

```json
{
  "error": {
    "code": "PUBLIC_API_SCOPE_DENIED",
    "message": "Public API key does not include the required scope."
  }
}
```

Common error cases:

| HTTP | Example code | Meaning |
| --- | --- | --- |
| 401 | `PUBLIC_API_KEY_MISSING` | No API key was supplied |
| 401 | `PUBLIC_API_KEY_INVALID` | API key is malformed or unknown |
| 401 | `PUBLIC_API_KEY_REVOKED` | API key was revoked |
| 401 | `PUBLIC_API_KEY_EXPIRED` | API key expired |
| 403 | `PUBLIC_API_SCOPE_DENIED` | Key lacks the required scope |
| 403 | `PUBLIC_API_STORE_INACTIVE` | Store is not active |
| 400 | `PUBLIC_API_UPLOAD_MULTIPART_INVALID` | Upload request shape is invalid |
| 400 | `PUBLIC_API_UPLOAD_IMAGE_INVALID` | Image failed technical validation |
| 400 | `PUBLIC_API_WEBHOOK_URL_INVALID` | Webhook URL is not a valid HTTPS URL |
| 400 | `PUBLIC_API_WEBHOOK_EVENTS_INVALID` | Webhook subscribed events are invalid |
| 404 | `TRY_ON_SESSION_NOT_FOUND` | Session or asset is outside the key's Store scope |
| 404 | `PUBLIC_API_TRYON_NOT_FOUND` | Try-On run is not visible to this key's Store |
| 404 | `PUBLIC_API_TRYON_RESULT_NOT_FOUND` | Try-On result is not available for download |
| 404 | `PUBLIC_API_WEBHOOK_ENDPOINT_NOT_FOUND` | Webhook endpoint is not visible to this key's Store |

## Full Minimal Flow

```bash
export SELFX_API_KEY="selfx_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
export SELFX_API_BASE="https://api.selfx.example"

curl -sS -H "x-selfx-api-key: $SELFX_API_KEY" \
  "$SELFX_API_BASE/api/v1/public/me"

curl -sS -X POST -H "x-selfx-api-key: $SELFX_API_KEY" \
  -F "purpose=PERSON" \
  -F "image=@./person.png;type=image/png" \
  "$SELFX_API_BASE/api/v1/public/uploads"

curl -sS -X POST -H "x-selfx-api-key: $SELFX_API_KEY" \
  -F "purpose=GARMENT" \
  -F "sessionId=$SESSION_ID" \
  -F "image=@./garment.png;type=image/png" \
  "$SELFX_API_BASE/api/v1/public/uploads"

curl -sS -X POST \
  -H "content-type: application/json" \
  -H "x-selfx-api-key: $SELFX_API_KEY" \
  -d "{
    \"clientRequestId\": \"integration-test-001\",
    \"sessionId\": \"$SESSION_ID\",
    \"personAssetId\": \"$PERSON_ASSET_ID\",
    \"garmentAssetId\": \"$GARMENT_ASSET_ID\",
    \"garmentIntent\": \"TOP\",
    \"category\": \"TOP\",
    \"garmentPhotoType\": \"FLAT_LAY\",
    \"generationProfile\": \"BALANCED\"
  }" \
  "$SELFX_API_BASE/api/v1/public/try-ons"

curl -sS -H "x-selfx-api-key: $SELFX_API_KEY" \
  "$SELFX_API_BASE/api/v1/public/try-ons/$RUN_ID"

curl -L -H "x-selfx-api-key: $SELFX_API_KEY" \
  -o selfx-look.png \
  "$SELFX_API_BASE/api/v1/public/try-ons/$RUN_ID/download"

curl -sS -H "x-selfx-api-key: $SELFX_API_KEY" \
  "$SELFX_API_BASE/api/v1/public/usage?range=7d"
```

## Current Limitations

- Public API usage reports operational counts only. Pricing, invoices and billing calculations are intentionally deferred.
- Public API product/catalog references are not exposed yet; this first surface uses uploaded person and garment assets.
- Webhook delivery records failed attempts and `nextRetryAt`, but an automatic retry worker is still deferred.
