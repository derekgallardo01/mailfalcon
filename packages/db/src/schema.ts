import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  createdAt: integer('created_at').notNull(),
  tier: text('tier', { enum: ['free', 'pro', 'team'] }).notNull().default('free'),
  stripeCustId: text('stripe_cust_id'),
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
    threadId: text('thread_id'),
    messageId: text('message_id'),
    recipientCount: integer('recipient_count').notNull(),
    sentAt: integer('sent_at').notNull(),
    hmacSalt: text('hmac_salt').notNull(),
    privacyMode: integer('privacy_mode').notNull().default(0),
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
    type: text('type', { enum: ['open', 'click'] }).notNull(),
    linkId: text('link_id'),
    ts: integer('ts').notNull(),
    uaClass: text('ua_class', {
      enum: ['desktop', 'mobile', 'bot', 'unknown'],
    }).notNull(),
    ipPrefix: text('ip_prefix'),
    country: text('country'),
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
