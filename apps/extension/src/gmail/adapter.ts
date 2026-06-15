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
  cancel(): void
}

export interface GmailAdapter {
  load(): Promise<void>
  onPresending(handler: (event: ComposeEvent) => Promise<void> | void): void
}
