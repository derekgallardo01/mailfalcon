export interface ComposeEvent {
  getHtmlBody(): string
  setHtmlBody(html: string): void
  getRecipientCount(): number
  cancel(): void
}

export interface GmailAdapter {
  load(): Promise<void>
  onPresending(handler: (event: ComposeEvent) => Promise<void> | void): void
}
