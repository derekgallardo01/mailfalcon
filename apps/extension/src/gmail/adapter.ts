export interface RecipientHandle {
  address: string
  name?: string
}

export interface ComposeEvent {
  getHtmlBody(): string
  setHtmlBody(html: string): void
  getRecipientCount(): number
  getRecipients(): RecipientHandle[]
  getSubject(): string
  isPrivacyMode(): boolean
  /** Null when no reminder was selected; number of days otherwise. */
  getRemindAfterDays(): number | null
  /** Gmail's thread ID if the compose is a reply; null for fresh compose. */
  getThreadId(): string | null
  /** Register a callback that fires once after Gmail confirms send.
   *  Receives the new messageId Gmail assigns. */
  onSent(cb: (info: { messageId: string; threadId: string }) => void): void
  cancel(): void
}

export interface GmailAdapter {
  load(): Promise<void>
  onPresending(handler: (event: ComposeEvent) => Promise<void> | void): void
}
