import { config } from './config'
import { getSession } from './auth-store'

function authHeader(): Record<string, string> {
  const s = getSession()
  return s ? { Authorization: `Bearer ${s.token}` } : {}
}

export async function requestCode(email: string): Promise<void> {
  const res = await fetch(`${config.apiHost}/auth/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) throw new Error(`request_failed:${res.status}`)
}

export interface VerifyResponse {
  token: string
  userId: string
  email: string
}

export async function verifyCode(
  email: string,
  code: string,
): Promise<VerifyResponse> {
  const res = await fetch(`${config.apiHost}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `verify_failed:${res.status}`)
  }
  return (await res.json()) as VerifyResponse
}

export async function logout(): Promise<void> {
  await fetch(`${config.apiHost}/auth/logout`, {
    method: 'POST',
    headers: { ...authHeader() },
  }).catch(() => undefined)
}

export interface EmailListItem {
  id: string
  subject: string | null
  sentAt: number
  recipientCount: number
  privacyMode: boolean
  /** Total opens, including Gmail's image proxy and other prefetchers. */
  openCount: number
  /** Opens with uaClass != 'bot'. Use as the headline number. */
  humanOpenCount: number
  clickCount: number
  lastEventAt: number | null
  senderUserId: string
}

export interface EmailListResponse {
  emails: EmailListItem[]
  nextCursor: number | null
}

export type EmailSort =
  | 'sentAt-desc'
  | 'sentAt-asc'
  | 'opens-desc'
  | 'clicks-desc'

export interface EmailQueryParams {
  q?: string
  sort?: EmailSort
  from?: number
  to?: number
  cursor?: number
  limit?: number
  tag?: string
  scope?: 'personal' | 'workspace'
}

export async function listEmails(
  params: EmailQueryParams = {},
): Promise<EmailListResponse> {
  const url = new URL(`${config.apiHost}/v1/emails`)
  if (params.cursor) url.searchParams.set('cursor', String(params.cursor))
  if (params.limit) url.searchParams.set('limit', String(params.limit))
  if (params.q) url.searchParams.set('q', params.q)
  if (params.sort) url.searchParams.set('sort', params.sort)
  if (params.from !== undefined) url.searchParams.set('from', String(params.from))
  if (params.to !== undefined) url.searchParams.set('to', String(params.to))
  if (params.tag) url.searchParams.set('tag', params.tag)
  if (params.scope) url.searchParams.set('scope', params.scope)
  const res = await fetch(url, {
    headers: { ...authHeader() },
  })
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(`list_failed:${res.status}`)
  return (await res.json()) as EmailListResponse
}

export async function listEmailTags(): Promise<string[]> {
  const res = await fetch(`${config.apiHost}/v1/emails/tags`, {
    headers: { ...authHeader() },
  })
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(`tags_failed:${res.status}`)
  const data = (await res.json()) as { tags: string[] }
  return data.tags
}

export async function patchEmailMeta(
  id: string,
  patch: { tags?: string[]; notes?: string; notificationsMuted?: boolean },
): Promise<void> {
  const res = await fetch(`${config.apiHost}/v1/emails/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(patch),
  })
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(`patch_failed:${res.status}`)
}

export interface EmailDetail {
  email: {
    id: string
    subject: string | null
    sentAt: number
    recipientCount: number
    privacyMode: boolean
    threadId: string | null
    notificationsMuted: boolean
    tags: string[]
    notes: string
  }
  counts: { opens: number; clicks: number; humanOpens: number }
  links: { idx: number; originalUrl: string }[]
  recipients: { id: string; displayLabel: string | null }[]
  events: {
    id: number
    type: 'open' | 'click' | 'reply'
    ts: number
    linkId: string | null
    recipientId: string | null
    uaClass: 'desktop' | 'mobile' | 'bot' | 'unknown'
    ipPrefix: string | null
    ipFull: string | null
    country: string | null
    region: string | null
    regionCode: string | null
    city: string | null
    postalCode: string | null
    latitude: string | null
    longitude: string | null
    timezone: string | null
    browserName: string | null
    browserVersion: string | null
    osName: string | null
    osVersion: string | null
    deviceType: string | null
    deviceVendor: string | null
    deviceModel: string | null
    isFirstOpen: boolean
  }[]
}

export async function getEmailDetail(id: string): Promise<EmailDetail> {
  const res = await fetch(`${config.apiHost}/v1/emails/${encodeURIComponent(id)}`, {
    headers: { ...authHeader() },
  })
  if (res.status === 401) throw new Error('unauthorized')
  if (res.status === 404) throw new Error('not_found')
  if (!res.ok) throw new Error(`detail_failed:${res.status}`)
  return (await res.json()) as EmailDetail
}

export interface MeResponse {
  id: string
  email: string
  tier: 'free' | 'pro' | 'team' | 'admin'
  createdAt: number
  hasStripeCustomer: boolean
  digestEnabled: boolean
  digestLastSentDay: string | null
  quietStartMinute: number | null
  quietEndMinute: number | null
  quietTimezone: string | null
  usage: { used: number; limit: number }
  activeWorkspaceId: string
  activeWorkspaceName: string
  activeWorkspaceRole: 'owner' | 'member'
  workspaces: Array<{
    id: string
    name: string
    role: 'owner' | 'member'
    isPersonal: boolean
    memberCount: number
  }>
}

export interface WorkspaceMember {
  userId: string
  email: string
  role: 'owner' | 'member'
  joinedAt: number
}

export interface WorkspaceInviteListItem {
  id: string
  email: string
  createdAt: number
  expiresAt: number
}

export async function listWorkspaces(): Promise<{
  workspaces: MeResponse['workspaces']
}> {
  const res = await fetch(`${config.apiHost}/v1/workspaces`, {
    headers: { ...authHeader() },
  })
  if (!res.ok) throw new Error(`workspaces_list_failed:${res.status}`)
  return (await res.json()) as { workspaces: MeResponse['workspaces'] }
}

export async function createWorkspace(name: string): Promise<{ id: string; name: string }> {
  const res = await fetch(`${config.apiHost}/v1/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `workspace_create_failed:${res.status}`)
  }
  return (await res.json()) as { id: string; name: string }
}

export async function renameWorkspace(id: string, name: string): Promise<void> {
  const res = await fetch(`${config.apiHost}/v1/workspaces/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw new Error(`workspace_rename_failed:${res.status}`)
}

export async function deleteWorkspace(id: string): Promise<void> {
  const res = await fetch(`${config.apiHost}/v1/workspaces/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { ...authHeader() },
  })
  if (!res.ok) throw new Error(`workspace_delete_failed:${res.status}`)
}

export async function listWorkspaceMembers(id: string): Promise<{
  members: WorkspaceMember[]
  pendingInvites: WorkspaceInviteListItem[]
}> {
  const res = await fetch(
    `${config.apiHost}/v1/workspaces/${encodeURIComponent(id)}/members`,
    { headers: { ...authHeader() } },
  )
  if (!res.ok) throw new Error(`workspace_members_failed:${res.status}`)
  return (await res.json()) as {
    members: WorkspaceMember[]
    pendingInvites: WorkspaceInviteListItem[]
  }
}

export async function removeWorkspaceMember(
  workspaceId: string,
  memberId: string,
): Promise<void> {
  const res = await fetch(
    `${config.apiHost}/v1/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(memberId)}`,
    { method: 'DELETE', headers: { ...authHeader() } },
  )
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `workspace_remove_failed:${res.status}`)
  }
}

export async function inviteToWorkspace(
  workspaceId: string,
  email: string,
): Promise<void> {
  const res = await fetch(
    `${config.apiHost}/v1/workspaces/${encodeURIComponent(workspaceId)}/invites`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ email }),
    },
  )
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `workspace_invite_failed:${res.status}`)
  }
}

export async function switchWorkspace(id: string): Promise<void> {
  const res = await fetch(
    `${config.apiHost}/v1/workspaces/${encodeURIComponent(id)}/switch`,
    { method: 'POST', headers: { ...authHeader() } },
  )
  if (!res.ok) throw new Error(`workspace_switch_failed:${res.status}`)
}

export async function previewInvite(token: string): Promise<{
  workspaceName: string
  inviterEmail: string
  inviteEmail: string
}> {
  const res = await fetch(
    `${config.apiHost}/workspace-invites/${encodeURIComponent(token)}`,
  )
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `preview_failed:${res.status}`)
  }
  return (await res.json()) as {
    workspaceName: string
    inviterEmail: string
    inviteEmail: string
  }
}

export async function acceptInvite(token: string): Promise<{ workspaceId: string }> {
  const res = await fetch(
    `${config.apiHost}/v1/workspaces/invites/${encodeURIComponent(token)}/accept`,
    { method: 'POST', headers: { ...authHeader() } },
  )
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `accept_failed:${res.status}`)
  }
  return (await res.json()) as { workspaceId: string }
}

export async function getMe(): Promise<MeResponse> {
  const res = await fetch(`${config.apiHost}/v1/me`, {
    headers: { ...authHeader() },
  })
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(`me_failed:${res.status}`)
  return (await res.json()) as MeResponse
}

export async function updateMe(patch: {
  digestEnabled?: boolean
  quietStartMinute?: number | null
  quietEndMinute?: number | null
  quietTimezone?: string | null
}): Promise<void> {
  const res = await fetch(`${config.apiHost}/v1/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(patch),
  })
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(`me_patch_failed:${res.status}`)
}

/** Triggers a JSON download of every row scoped to the current user. */
export async function exportMe(): Promise<void> {
  const res = await fetch(`${config.apiHost}/v1/me/export`, {
    headers: { ...authHeader() },
  })
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(`export_failed:${res.status}`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `mailfalcon-export-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function requestAccountDeletion(): Promise<void> {
  const res = await fetch(`${config.apiHost}/v1/me/delete-request`, {
    method: 'POST',
    headers: { ...authHeader() },
  })
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) throw new Error(`delete_request_failed:${res.status}`)
}

export interface DeleteAccountResponse {
  ok: true
  stripeWarning: string | null
  sessionsSwept?: number
}

export async function confirmAccountDeletion(
  code: string,
): Promise<DeleteAccountResponse> {
  const res = await fetch(`${config.apiHost}/v1/me`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ code }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `delete_failed:${res.status}`)
  }
  return (await res.json()) as DeleteAccountResponse
}

export async function startCheckout(tier: 'pro' | 'team' = 'pro'): Promise<string> {
  const res = await fetch(`${config.apiHost}/v1/billing/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ tier }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `checkout_failed:${res.status}`)
  }
  const data = (await res.json()) as { url: string }
  return data.url
}

export interface SubscriptionInfo {
  id: string
  stripeSubId: string
  status: string
  currentPeriodEnd: number
  tier: 'pro' | 'team'
}

export async function getSubscription(): Promise<SubscriptionInfo | null> {
  const res = await fetch(`${config.apiHost}/v1/billing/subscription`, {
    headers: { ...authHeader() },
  })
  if (!res.ok) return null
  const data = (await res.json()) as { subscription: SubscriptionInfo | null }
  return data.subscription
}

export interface Template {
  id: string
  name: string
  subject: string
  bodyHtml: string
  createdAt: number
  scope: 'personal' | 'workspace'
  workspaceId: string | null
  workspaceName: string | null
  creatorUserId: string
}

export interface TemplateInput {
  name: string
  subject: string
  bodyHtml: string
  /** null/omitted = personal. Set = share with that workspace. */
  workspaceId?: string | null
}

export const templates = {
  list: async (): Promise<Template[]> => {
    const res = await fetch(`${config.apiHost}/v1/templates`, {
      headers: { ...authHeader() },
    })
    if (res.status === 401) throw new Error('unauthorized')
    if (!res.ok) throw new Error(`templates_list_failed:${res.status}`)
    const data = (await res.json()) as { templates: Template[] }
    return data.templates
  },
  create: async (input: TemplateInput): Promise<string> => {
    const res = await fetch(`${config.apiHost}/v1/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify(input),
    })
    if (!res.ok) throw new Error(`templates_create_failed:${res.status}`)
    const data = (await res.json()) as { id: string }
    return data.id
  },
  update: async (id: string, input: TemplateInput): Promise<void> => {
    const res = await fetch(
      `${config.apiHost}/v1/templates/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(input),
      },
    )
    if (!res.ok) throw new Error(`templates_update_failed:${res.status}`)
  },
  remove: async (id: string): Promise<void> => {
    const res = await fetch(
      `${config.apiHost}/v1/templates/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        headers: { ...authHeader() },
      },
    )
    if (!res.ok) throw new Error(`templates_delete_failed:${res.status}`)
  },
}

export interface Followup {
  id: string
  emailId: string
  subject: string | null
  remindAt: number
  condition: 'no_open' | 'no_reply' | 'always'
  fired: boolean
}

export const followups = {
  list: async (): Promise<Followup[]> => {
    const res = await fetch(`${config.apiHost}/v1/followups`, {
      headers: { ...authHeader() },
    })
    if (res.status === 401) throw new Error('unauthorized')
    if (!res.ok) throw new Error(`followups_list_failed:${res.status}`)
    const data = (await res.json()) as { followups: Followup[] }
    return data.followups
  },
  create: async (input: {
    emailId: string
    remindAfterDays: number
    condition?: 'no_open' | 'no_reply' | 'always'
  }): Promise<{ id: string; remindAt: number }> => {
    const res = await fetch(`${config.apiHost}/v1/followups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify(input),
    })
    if (!res.ok) throw new Error(`followups_create_failed:${res.status}`)
    return (await res.json()) as { id: string; remindAt: number }
  },
  remove: async (id: string): Promise<void> => {
    const res = await fetch(
      `${config.apiHost}/v1/followups/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        headers: { ...authHeader() },
      },
    )
    if (!res.ok) throw new Error(`followups_delete_failed:${res.status}`)
  },
}

export async function openBillingPortal(): Promise<string> {
  const res = await fetch(`${config.apiHost}/v1/billing/portal`, {
    method: 'POST',
    headers: { ...authHeader() },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `portal_failed:${res.status}`)
  }
  const data = (await res.json()) as { url: string }
  return data.url
}

async function adminGet<T>(path: string): Promise<T> {
  const res = await fetch(`${config.apiHost}/v1/admin${path}`, {
    headers: { ...authHeader() },
  })
  if (res.status === 401) throw new Error('unauthorized')
  if (res.status === 403) throw new Error('forbidden')
  if (!res.ok) throw new Error(`admin_failed:${res.status}`)
  return (await res.json()) as T
}

export interface AdminStats {
  totals: { users: number; emails: number; events: number }
  usersByTier: Record<string, number>
  today: { newUsers: number; emailsSent: number; eventsLogged: number }
  telemetry: {
    installedNeverSent: number
    activated: number
    active7d: number
  }
}

export type UserStatus = 'never_installed' | 'installed' | 'activated' | 'active' | 'dormant'

export interface AdminUser {
  id: string
  email: string
  tier: 'free' | 'pro' | 'team' | 'admin'
  createdAt: number
  installedAt: number | null
  firstSendAt: number | null
  lastSeenAt: number | null
  extensionVersion: string | null
  emailCount: number
  lastEmailAt: number | null
  workspaceCount: number
  templateCount: number
  status: UserStatus
}

export interface AdminEmail {
  id: string
  userId: string
  userEmail: string
  subject: string | null
  sentAt: number
  recipientCount: number
  privacyMode: boolean
  opens: number
  humanOpens: number
  clicks: number
}

export interface AdminEvent {
  id: number
  emailId: string
  type: 'open' | 'click'
  linkId: string | null
  ts: number
  uaClass: 'desktop' | 'mobile' | 'bot' | 'unknown'
  ipPrefix: string | null
  ipFull: string | null
  country: string | null
  region: string | null
  regionCode: string | null
  city: string | null
  postalCode: string | null
  latitude: string | null
  longitude: string | null
  timezone: string | null
  browserName: string | null
  browserVersion: string | null
  osName: string | null
  osVersion: string | null
  deviceType: string | null
  deviceVendor: string | null
  deviceModel: string | null
  isFirstOpen: boolean
  userId: string
  userEmail: string
}

export interface AdminUserDetail {
  user: {
    id: string
    email: string
    tier: 'free' | 'pro' | 'team' | 'admin'
    createdAt: number
    stripeCustId: string | null
    hasStripeCustomer: boolean
    installedAt: number | null
    firstSendAt: number | null
    lastSeenAt: number | null
    extensionVersion: string | null
    extensionInstallId: string | null
    status: UserStatus
  }
  totals: {
    emails: number
    opens: number
    humanOpens: number
    clicks: number
  }
  workspaces: Array<{
    id: string
    name: string
    role: 'owner' | 'member'
    isPersonal: boolean
    memberCount: number
  }>
  templates: {
    personal: number
    workspace: number
    recent: Array<{
      id: string
      name: string
      createdAt: number
      workspaceId: string | null
    }>
  }
  contactsEngaged: number
  subscription: SubscriptionInfo | null
  emails: Array<{
    id: string
    subject: string | null
    sentAt: number
    recipientCount: number
    privacyMode: boolean
    opens: number
    clicks: number
    lastEventAt: number | null
  }>
  events: Array<{
    id: number
    emailId: string
    type: 'open' | 'click' | 'reply'
    linkId: string | null
    ts: number
    uaClass: 'desktop' | 'mobile' | 'bot' | 'unknown'
    ipPrefix: string | null
    ipFull: string | null
    country: string | null
    region: string | null
    regionCode: string | null
    city: string | null
    postalCode: string | null
    latitude: string | null
    longitude: string | null
    timezone: string | null
    browserName: string | null
    browserVersion: string | null
    osName: string | null
    osVersion: string | null
    deviceType: string | null
    deviceVendor: string | null
    deviceModel: string | null
    isFirstOpen: boolean
  }>
}

export interface AdminEmailQueryParams {
  q?: string
  sort?: EmailSort
  from?: number
  to?: number
  userId?: string
}

export const admin = {
  stats: () => adminGet<AdminStats>('/stats'),
  users: (status?: UserStatus) =>
    adminGet<{ users: AdminUser[]; nextCursor: number | null }>(
      status ? `/users?status=${encodeURIComponent(status)}` : '/users',
    ),
  userDetail: (id: string) => adminGet<AdminUserDetail>(`/users/${encodeURIComponent(id)}`),
  emails: (params: AdminEmailQueryParams = {}) => {
    const qs = new URLSearchParams()
    if (params.q) qs.set('q', params.q)
    if (params.sort) qs.set('sort', params.sort)
    if (params.from !== undefined) qs.set('from', String(params.from))
    if (params.to !== undefined) qs.set('to', String(params.to))
    if (params.userId) qs.set('userId', params.userId)
    const suffix = qs.toString() ? `?${qs}` : ''
    return adminGet<{ emails: AdminEmail[] }>(`/emails${suffix}`)
  },
  events: () => adminGet<{ events: AdminEvent[] }>('/events'),
}

export interface ContactListItem {
  hashedAddr: string
  displayLabel: string | null
  sends: number
  humanOpens: number
  clicks: number
  replies: number
  lastEventAt: number | null
  firstSeenAt: number
}

export type ContactSort =
  | 'lastSeen-desc'
  | 'sends-desc'
  | 'opens-desc'
  | 'replyRate-desc'

export interface ContactListResponse {
  contacts: ContactListItem[]
  nextCursor: number | null
}

export async function listContacts(opts: {
  cursor?: number
  limit?: number
  q?: string
  sort?: ContactSort
  scope?: 'personal' | 'workspace'
}): Promise<ContactListResponse> {
  const qs = new URLSearchParams()
  if (opts.cursor) qs.set('cursor', String(opts.cursor))
  if (opts.limit) qs.set('limit', String(opts.limit))
  if (opts.q && opts.q.length > 0) qs.set('q', opts.q)
  if (opts.sort) qs.set('sort', opts.sort)
  if (opts.scope) qs.set('scope', opts.scope)
  const suffix = qs.toString() ? `?${qs}` : ''
  const res = await fetch(`${config.apiHost}/v1/contacts${suffix}`, {
    headers: { ...authHeader() },
  })
  if (!res.ok) throw new Error(`contacts_list_failed:${res.status}`)
  return (await res.json()) as ContactListResponse
}

export interface ContactDetail {
  contact: {
    hashedAddr: string
    displayLabel: string | null
    sends: number
    humanOpens: number
    clicks: number
    replies: number
    lastEventAt: number | null
    firstSeenAt: number
    avgTimeToFirstOpenMs: number | null
  }
  emails: Array<{
    id: string
    subject: string | null
    sentAt: number
    humanOpens: number
    clicks: number
    hasReply: boolean
  }>
  events: Array<{
    type: 'open' | 'click' | 'reply'
    ts: number
    emailId: string
    subject: string | null
    uaClass: 'desktop' | 'mobile' | 'bot' | 'unknown'
    city: string | null
    country: string | null
    regionCode: string | null
  }>
}

export async function getContact(hashedAddr: string): Promise<ContactDetail> {
  const res = await fetch(
    `${config.apiHost}/v1/contacts/${encodeURIComponent(hashedAddr)}`,
    { headers: { ...authHeader() } },
  )
  if (!res.ok) throw new Error(`contact_get_failed:${res.status}`)
  return (await res.json()) as ContactDetail
}
