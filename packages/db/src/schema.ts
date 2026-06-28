import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  createdAt: integer('created_at').notNull(),
  tier: text('tier', { enum: ['free', 'pro', 'team', 'admin'] })
    .notNull()
    .default('free'),
  stripeCustId: text('stripe_cust_id'),
  // Daily digest opt-in. 1 = receive, 0 = opted out.
  digestEnabled: integer('digest_enabled').notNull().default(1),
  // YYYY-MM-DD (UTC) of the last digest we sent, prevents double-sends
  // if cron retries.
  digestLastSentDay: text('digest_last_sent_day'),
  // Quiet hours: when the current time (in quietTimezone) falls inside
  // [quietStartMinute, quietEndMinute) the push fan-out is skipped.
  // Minutes since midnight (0–1439). Identical start/end disables.
  // quietTimezone is an IANA name; null falls back to UTC.
  quietStartMinute: integer('quiet_start_minute'),
  quietEndMinute: integer('quiet_end_minute'),
  quietTimezone: text('quiet_timezone'),
  // The workspace whose context this user is currently acting in.
  // Defaults to their personal workspace; updated when they switch.
  // Nullable only because the bootstrap migration runs after the
  // column is added — once the migration completes, every user has a
  // non-null value.
  activeWorkspaceId: text('active_workspace_id'),
  // Extension-install + activity telemetry. installedAt = first
  // /v1/extension/ping. firstSendAt = first tracked-email mint
  // (backfilled for existing users from MIN(tracked_emails.sent_at)).
  // lastSeenAt updates on every ping (throttled to 30min). version +
  // installId are the most-recent ping's payload — installId is a per-
  // device UUID so admin can spot reinstall-vs-continuous-use.
  installedAt: integer('installed_at'),
  firstSendAt: integer('first_send_at'),
  lastSeenAt: integer('last_seen_at'),
  extensionVersion: text('extension_version'),
  extensionInstallId: text('extension_install_id'),
  // 14-day Pro trial automatically granted on signup. effectiveTier in
  // /v1/me reads this — if tier === 'free' AND trial_ends_at > now,
  // surfaces 'pro' to the caller. Allows new users to try paid features
  // before deciding to subscribe.
  trialEndsAt: integer('trial_ends_at'),
  // Activation playbook timestamps. Welcome fires ~5min after the first
  // /v1/extension/ping; the 3-day reminder fires if first_send_at is
  // still null at that point.
  welcomeEmailSentAt: integer('welcome_email_sent_at'),
  activationEmailSentAt: integer('activation_email_sent_at'),
  // Second daily digest at 17:00 UTC (~1pm ET) — catches activity the
  // nightly 22:00 digest missed. Gated by digestEnabled.
  middayDigestEnabled: integer('midday_digest_enabled').notNull().default(1),
  // Cron-driven push when a contact crosses an engagement threshold
  // (open burst, click after dormancy, reply within 24h).
  hotLeadAlertsEnabled: integer('hot_lead_alerts_enabled').notNull().default(1),
  // Which slot of "today" we already sent — 'morning' or 'midday'.
  digestLastSentSlot: text('digest_last_sent_slot'),
  // Pro-tier white-label tracking. If verified, pixel + click URLs go
  // through the custom host instead of t.mailfalcon.app. The token is
  // the value the user puts in a TXT record we verify via DNS-over-HTTPS.
  customTrackerHost: text('custom_tracker_host'),
  customTrackerVerifiedAt: integer('custom_tracker_verified_at'),
  customTrackerToken: text('custom_tracker_token'),
  // Branded PDF/HTML reports — agency-friendly. Falls back to MailFalcon
  // brand when null.
  companyName: text('company_name'),
  companyLogoUrl: text('company_logo_url'),
})

export const subscriptions = sqliteTable('subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  stripeSubId: text('stripe_sub_id').notNull().unique(),
  status: text('status').notNull(),
  currentPeriodEnd: integer('current_period_end').notNull(),
  tier: text('tier', { enum: ['pro', 'team'] }).notNull(),
})

export const trackedEmails = sqliteTable(
  'tracked_emails',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id),
    subjectHash: text('subject_hash'),
    // Plaintext subject (capped 500 chars) — visible to the sender and
    // to admins. Privacy policy discloses storage. Old rows are NULL.
    subject: text('subject'),
    threadId: text('thread_id'),
    messageId: text('message_id'),
    recipientCount: integer('recipient_count').notNull(),
    sentAt: integer('sent_at').notNull(),
    hmacSalt: text('hmac_salt').notNull(),
    privacyMode: integer('privacy_mode').notNull().default(0),
    // Power-user metadata. tags is a JSON array of strings (lowercased,
    // ≤30 chars each, max 10 per email). notes is freeform text up to
    // 5000 chars. Both used by dashboard filters; nothing recipient-side.
    tags: text('tags').notNull().default('[]'),
    notes: text('notes').notNull().default(''),
    // Per-email notification mute. When 1, opens / clicks / replies are
    // still recorded for the dashboard but the push fan-out is skipped.
    notificationsMuted: integer('notifications_muted').notNull().default(0),
  },
  (table) => ({
    userSentIdx: index('tracked_emails_user_sent_idx').on(table.userId, table.sentAt),
  }),
)

export const recipients = sqliteTable('recipients', {
  id: text('id').primaryKey(),
  emailId: text('email_id')
    .notNull()
    .references(() => trackedEmails.id, { onDelete: 'cascade' }),
  hashedAddr: text('hashed_addr').notNull(),
  displayLabel: text('display_label'),
})

export const links = sqliteTable('links', {
  id: text('id').primaryKey(),
  emailId: text('email_id')
    .notNull()
    .references(() => trackedEmails.id, { onDelete: 'cascade' }),
  idx: integer('idx').notNull(),
  originalUrl: text('original_url').notNull(),
})

export const events = sqliteTable(
  'events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    emailId: text('email_id')
      .notNull()
      .references(() => trackedEmails.id, { onDelete: 'cascade' }),
    recipientId: text('recipient_id').references(() => recipients.id),
    type: text('type', { enum: ['open', 'click', 'reply'] }).notNull(),
    linkId: text('link_id'),
    ts: integer('ts').notNull(),
    uaClass: text('ua_class', {
      enum: ['desktop', 'mobile', 'bot', 'unknown'],
    }).notNull(),
    // /24-truncated IPv4 (or /48-truncated IPv6) for aggregate stats
    ipPrefix: text('ip_prefix'),
    // Full IP — admin-only access via dashboard; raw value for abuse
    // investigation. Privacy policy discloses retention.
    ipFull: text('ip_full'),
    country: text('country'),
    region: text('region'),
    regionCode: text('region_code'),
    city: text('city'),
    postalCode: text('postal_code'),
    latitude: text('latitude'),
    longitude: text('longitude'),
    timezone: text('timezone'),
    browserName: text('browser_name'),
    browserVersion: text('browser_version'),
    osName: text('os_name'),
    osVersion: text('os_version'),
    deviceType: text('device_type'),
    deviceVendor: text('device_vendor'),
    deviceModel: text('device_model'),
    isFirstOpen: integer('is_first_open').notNull().default(0),
  },
  (table) => ({
    emailTsIdx: index('events_email_ts_idx').on(table.emailId, table.ts),
    emailRecipientIdx: index('events_email_recipient_idx').on(
      table.emailId,
      table.recipientId,
    ),
  }),
)

export const templates = sqliteTable('templates', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  subject: text('subject').notNull(),
  bodyHtml: text('body_html').notNull(),
  createdAt: integer('created_at').notNull(),
  // Workspace scope. Null = personal (only the creator sees it). Set =
  // shared with every member of that workspace. The workspace owner
  // can edit any shared template; non-owners can edit only ones they
  // created.
  workspaceId: text('workspace_id'),
})

export const followUps = sqliteTable('follow_ups', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  emailId: text('email_id')
    .notNull()
    .references(() => trackedEmails.id, { onDelete: 'cascade' }),
  remindAt: integer('remind_at').notNull(),
  condition: text('condition', {
    enum: ['no_open', 'no_reply', 'always'],
  }).notNull(),
  fired: integer('fired').notNull().default(0),
})

export const notificationSubscriptions = sqliteTable(
  'notification_subscriptions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    ua: text('ua'),
    createdAt: integer('created_at').notNull(),
    // Bumped on subscribe + on successful push delivery. Used by the
    // cron sweep to delete subscriptions whose endpoint has rotated
    // (Web Push providers re-issue endpoints; the old rows linger).
    lastSeenAt: integer('last_seen_at').notNull().default(0),
    // Per-event-type push preferences. All default on for backwards-
    // compat — existing users keep getting every event type unless
    // they explicitly toggle one off in Settings.
    notifyOpen: integer('notify_open').notNull().default(1),
    notifyClick: integer('notify_click').notNull().default(1),
    notifyReply: integer('notify_reply').notNull().default(1),
    notifyHotLead: integer('notify_hot_lead').notNull().default(1),
  },
  (table) => ({
    userIdx: index('notification_subscriptions_user_idx').on(table.userId),
  }),
)

/** Per-contact dedupe table for hot-lead push alerts. The evaluator
 *  cron skips firing if last_alerted_at is within the dedupe window
 *  (24h). Hashed_addr matches the tracked-emails recipient hash. */
export const hotLeadAlerts = sqliteTable(
  'hot_lead_alerts',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    hashedAddr: text('hashed_addr').notNull(),
    lastAlertedAt: integer('last_alerted_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.hashedAddr] }),
  }),
)

/** Webhook integrations — Slack incoming-webhook URLs or Discord
 *  webhook URLs (we sniff the platform from the URL pattern). Each
 *  webhook subscribes to a subset of event types. */
export const eventWebhooks = sqliteTable(
  'event_webhooks',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    notifyOpen: integer('notify_open').notNull().default(1),
    notifyClick: integer('notify_click').notNull().default(1),
    notifyReply: integer('notify_reply').notNull().default(1),
    notifyHotLead: integer('notify_hot_lead').notNull().default(1),
    enabled: integer('enabled').notNull().default(1),
    createdAt: integer('created_at').notNull(),
    lastFiredAt: integer('last_fired_at'),
    lastStatus: text('last_status'),
  },
  (table) => ({
    userIdx: index('event_webhooks_user_idx').on(table.userId),
  }),
)

export const usageCounters = sqliteTable(
  'usage_counters',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: text('day').notNull(),
    trackedCount: integer('tracked_count').notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.day] }),
  }),
)

/** Sign-in one-time codes. Moved off KV when the free-tier daily put
 *  cap kept blocking sign-in. D1 has no daily-cap on writes. Rows are
 *  deleted on successful verify; the cron sweeps anything past
 *  expiresAt that didn't get deleted (e.g. user requested then never
 *  verified). */
export const verifyCodes = sqliteTable('verify_codes', {
  email: text('email').primaryKey(),
  code: text('code').notNull(),
  attempts: integer('attempts').notNull().default(0),
  /** Throttle marker — the earliest UTC ms a fresh code can be issued. */
  cooldownUntil: integer('cooldown_until').notNull().default(0),
  expiresAt: integer('expires_at').notNull(),
})

/** Active JWT sessions. Lives in D1 (was KV) so sign-in survives a
 *  KV daily-put cap exhaustion. The jti is the JWT's unique id; the
 *  auth middleware looks the row up on every request to enforce
 *  revocation. */
export const sessions = sqliteTable(
  'sessions',
  {
    jti: text('jti').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (table) => ({
    byUser: index('sessions_user_idx').on(table.userId),
  }),
)

/** A shared container that owns templates and (optionally) gives the
 *  workspace owner aggregate visibility into team activity. Every user
 *  has at least one workspace — the auto-bootstrapped `is_personal=1`
 *  one created at signup. Additional workspaces are user-created and
 *  used for team collaboration. */
export const workspaces = sqliteTable(
  'workspaces',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 1 = auto-bootstrapped personal workspace (un-deletable).
     *  0 = user-created shared workspace. */
    isPersonal: integer('is_personal').notNull().default(0),
    createdAt: integer('created_at').notNull(),
  },
  (table) => ({
    ownerIdx: index('workspaces_owner_idx').on(table.ownerId),
  }),
)

/** Membership relation: which users belong to which workspaces. */
export const workspaceMembers = sqliteTable(
  'workspace_members',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'member'] }).notNull(),
    joinedAt: integer('joined_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.workspaceId, table.userId] }),
    byUser: index('workspace_members_user_idx').on(table.userId),
  }),
)

/** Pending invites — one row per invite token. The `id` IS the token
 *  (URL-safe, generated server-side). When the invitee signs in and
 *  hits POST /accept, we validate the token's email matches their
 *  session email, insert the member row, and mark accepted_at. */
export const workspaceInvites = sqliteTable(
  'workspace_invites',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    invitedBy: text('invited_by')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    /** Null = pending. Set on successful accept. */
    acceptedAt: integer('accepted_at'),
  },
  (table) => ({
    emailIdx: index('workspace_invites_email_idx').on(table.email),
  }),
)
