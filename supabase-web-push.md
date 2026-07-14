# Rodinka Web Push deployment and operations

Phase 4.1 PR2 completes the delivery half of the reminder pipeline. Reminder generation and digest scheduling remain in `process-reminders`; `send-notification-deliveries` only claims already prepared outbox rows and sends them to active browser devices.

```mermaid
flowchart LR
  P[process-reminders] --> O[(notification_deliveries)]
  C[Sender Cron every 2 min] --> S[send-notification-deliveries]
  S -->|lease + SKIP LOCKED| O
  S --> A[(notification_delivery_attempts)]
  S --> D[(push_subscriptions)]
  S --> W[Browser push service]
  W --> SW[Rodinka service worker]
  SW --> R[/reminders deep link]
```

## Data and security model

`push_subscriptions` stores one unique endpoint per browser subscription, its `p256dh` and `auth` encryption material, the authenticated owner, linked family member, a short device/browser label and delivery-health timestamps. It intentionally does not store a full user agent or a fingerprint. Users can select only their own rows; creation/reconciliation and revocation use narrow security-definer RPCs deriving the user from `auth.uid()`. Sending tables and encryption keys for other users remain service-role only.

The browser subscription is retained on logout. After the next login, an existing subscription is reconciled to the current authenticated account and family before it is shown as current. Disabling the account preference stops all sends but retains device rows; disabling the current device revokes its server row and calls `unsubscribe()` locally. A remote device can be revoked without affecting others.

## VAPID setup

Generate one key pair once and retain it in a password manager or deployment secret store. Do not generate a new pair per deployment.

```powershell
npx web-push generate-vapid-keys --json
```

Copy the public key to Vercel as `VITE_VAPID_PUBLIC_KEY` and rebuild the frontend. Configure the Edge Function with the matching pair and a contact URI:

```powershell
npx supabase secrets set VAPID_PUBLIC_KEY="PUBLIC_KEY" VAPID_PRIVATE_KEY="PRIVATE_KEY" VAPID_SUBJECT="mailto:notifications@example.com" NOTIFICATION_SENDER_SECRET="LONG_RANDOM_VALUE"
npx supabase functions deploy send-notification-deliveries --no-verify-jwt
```

The sender uses `@block65/webcrypto-web-push@1.0.2`: it supports Deno/Edge runtimes, RFC 8291 payload encryption and VAPID through Web Crypto and `fetch`, without Node-only crypto or HTTP APIs. Startup validates presence, format and subject. Diagnostics expose only a short SHA-256 public-key fingerprint.

| Environment item | Location | Public or secret | Purpose |
|---|---|---|---|
| `VITE_VAPID_PUBLIC_KEY` | Vercel frontend environment | Public | Browser `PushManager.subscribe()` application-server key |
| `VAPID_PUBLIC_KEY` | Supabase Edge Function secrets | Secret-store value, safe half of pair | Sender identity and fingerprint comparison |
| `VAPID_PRIVATE_KEY` | Supabase Edge Function secrets | Secret | Signs VAPID requests; never bundled or logged |
| `VAPID_SUBJECT` | Supabase Edge Function secrets | Operational secret/config | Contact URI required by VAPID |
| `NOTIFICATION_SENDER_SECRET` | Supabase Edge Function secrets + Vault | Secret | Authenticates Cron invocations |
| `rodinka_project_url` | Supabase Vault | Secret/config | Edge Function base URL for database Cron |
| `rodinka_notification_sender_secret` | Supabase Vault | Secret | Must equal `NOTIFICATION_SENDER_SECRET` |

The frontend and Edge public keys must be identical. A key rotation requires deploying the new public key, resubscribing each device and only then retiring the old private key; existing subscriptions created with the old application-server key cannot be silently migrated.

## Database and Cron deployment

Apply the migration, create Vault values, then install the sender schedule. If `rodinka_project_url` already exists from PR1, do not create it again.

```powershell
npx supabase db push
```

```sql
select vault.create_secret('https://PROJECT_REF.supabase.co', 'rodinka_project_url');
select vault.create_secret('THE_SAME_LONG_RANDOM_VALUE', 'rodinka_notification_sender_secret');
select configure_notification_sender_cron();
```

The schedule runs every two minutes with a maximum batch of 50. Each claim has a random processing token, a three-minute lease and `FOR UPDATE SKIP LOCKED`; overlapping Cron invocations cannot claim the same row. Expired leases are released. At-least-once delivery remains possible if the push service accepts a request and the function fails before the database commit, while stable notification tags minimize duplicate visible notifications.

| Delivery state | Trigger | Next state | Retry behavior |
|---|---|---|---|
| `pending` / `failed` | Due, relevant and below limits | `processing` | Atomic bounded claim, attempt count increments |
| `processing` | Valid preferences, outside quiet hours, active device | `delivered` | Delivered if at least one device succeeds |
| `processing` | Quiet hours started after planning | `pending` | Deferred directly to quiet-hours end |
| `processing` | 429, 5xx or network failure on every device | `pending` | Staged 1m, 5m, 15m, 1h, 4h backoff |
| `processing` | Resolved reminder, disabled preference/category/digest | `cancelled` | No retry |
| `processing` | No active or only dead subscriptions | `cancelled` | No retry until a new outbox delivery exists |
| `processing` | Permanent request/VAPID failure | `failed` | Bounded by five attempts and 24-hour expiry |
| Stale `processing` | Lease expires | `pending` | Safely reclaimable by a later invocation |

| HTTP/result class | Subscription action | Delivery action | Retry |
|---|---|---|---|
| 2xx | Reset failure health and record success | Delivered if any device succeeded | No |
| 404 / 410 | Set `disabled_at` for that endpoint | Continue other devices; cancel if none remain | No for dead device |
| 401 / 403 | Keep device for deployment repair | Record VAPID/config failure | Bounded only |
| 429 | Record transient failure | Requeue if no device succeeded | Yes, staged backoff |
| 5xx / timeout / network | Record transient failure | Requeue if no device succeeded | Yes, staged backoff |
| Other 4xx / encryption error | Record permanent failure | Fail bounded delivery | Bounded only |

## Browser UX and service worker

Permission is requested only after the user opens Reminder Center → Settings, selects “Zapnout na tomto zařízení”, reads the explanation and confirms. Page load only reconciles an already granted, existing subscription and never opens a browser prompt. Account preference, browser permission and each device registration are shown separately.

On iOS/iPadOS, normal Safari shows Home Screen instructions instead of a misleading permission prompt. Push is enabled only when display mode confirms the installed web app. Android and compatible desktop browsers can subscribe directly on a secure origin.

The custom `/sw.js` is the repository's single service worker. It keeps a minimal runtime app-shell/asset cache, does not call `skipWaiting()` or `clients.claim()`, parses push payloads defensively, falls back to generic Czech text and accepts only same-origin paths under its scope. Notification clicks focus and navigate an existing Rodinka window or open a new one. `pushsubscriptionchange` resubscribes when its cached public key is available; normal startup reconciliation is the reliable fallback because that event is not consistently supported.

Medical payloads are reduced to a generic health appointment message. Document payloads omit identifiers and descriptions. The sender never logs payloads, endpoints, subscription keys or the private VAPID key.

## Test notification and diagnostics

The settings action invokes the authenticated Edge Function. It rate-limits creation to once per two minutes, writes a real `notification_deliveries` row, claims only that row and sends it through the same VAPID/device/attempt pipeline as scheduled notifications. It does not call `new Notification()`.

Useful privacy-safe checks:

```sql
select count(*) filter (where disabled_at is null and revoked_at is null) as active_subscriptions,
       count(*) filter (where disabled_at is not null) as dead_disabled
from push_subscriptions;

select status, count(*) from notification_deliveries group by status order by status;
select status, retryable, count(*) from notification_delivery_attempts group by status, retryable order by status;
select count(*) as expired_leases from notification_deliveries where status = 'processing' and lease_expires_at < now();
```

For a configuration-only diagnostic, invoke the sender with the Cron secret and `{ "mode": "diagnostic" }`. The result reports configured state and the abbreviated public-key fingerprint, never key material.

## Support and manual QA

| Platform | Installation requirement | Push support | Tested status | Limitation |
|---|---|---|---|---|
| Android Chrome | HTTPS; installation recommended | Supported | Automated contracts only; real device unverified | Vendor/battery delivery timing varies |
| Desktop Chrome/Edge | HTTPS; installation optional | Supported | Local UI/build only; real remote push unverified | Browser background policy varies |
| macOS Safari 16+ | HTTPS and browser permission | Supported by compatible versions | Unverified | OS/browser version dependent |
| iPhone/iPad | Must be launched from Home Screen | Supported on compatible iOS/iPadOS | Unverified on real device | Normal Safari tab cannot subscribe |
| Firefox desktop | HTTPS | Supported | Unverified | Installed-PWA behavior differs by OS |

Manual release checklist:

1. On Android install Rodinka, enable from settings, fully close it, send a test, open the deep link, disable current device, then revoke another device.
2. In Chrome/Edge desktop repeat with an existing tab and with no open tab; confirm focus/navigation and offline app-shell fallback.
3. On iPhone/iPad confirm normal Safari shows instructions, add to Home Screen, launch from the icon, enable from the button, receive while closed and open the installed app from the notification.
4. Block permission at system/browser level and confirm actionable “blocked” state. Clear site data/reinstall and confirm startup reconciliation does not prompt automatically.
5. Deploy a service-worker update and verify the old worker keeps handling push until the normal lifecycle activates the new worker.

Localhost is treated as secure for browser API detection, but a complete push test still needs a valid public VAPID key, deployed sender, reachable Supabase project and browser push service. iOS behavior must be verified on a real compatible device and is not claimed as passed by automated tests.

## Permission reset, rollback and revocation

Reset browser permission from the site's notification settings, then return to Reminder Center. To revoke a lost device use its “Odebrat” action. To stop all account sends without deleting device diagnostics, turn off the account push preference.

For operational rollback, unschedule `rodinka-send-notifications-2m`, disable the Edge Function or set `push_enabled = false` for affected preferences. Preserve the outbox and attempt rows for diagnosis. Compromised VAPID keys require a new pair, frontend redeploy and device resubscription; rotate `NOTIFICATION_SENDER_SECRET` independently in both Edge secrets and Vault.

