export interface ComposeEvent {
  getHtmlBody(): string
  setHtmlBody(html: string): void
  getRecipientCount(): number
  getSubject(): string
  isPrivacyMode(): boolean
  cancel(): void
}

export interface GmailAdapter {
  load(): Promise<void>
  onPresending(handler: (event: ComposeEvent) => Promise<void> | void): void
}
