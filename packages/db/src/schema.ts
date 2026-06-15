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
  },
  (table) => ({
    userIdx: index('notification_subscriptions_user_idx').on(table.userId),
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
