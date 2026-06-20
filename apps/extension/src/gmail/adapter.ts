export interface RecipientHandle {
  address: string
  name?: string
}

export interface ComposeEvent {
  getHtmlBody(): string
  setHtmlBody(html: string): void
  setSubject(s: string): void
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
  /** Null when "Send now"; epoch ms otherwise. */
  getScheduledAt(): number | null
  /** True when the user opted into mail-merge — send a separate copy
   *  per recipient so per-recipient open + click attribution works. */
  isMailMerge(): boolean
  /** Programmatically close the compose without sending or saving as draft. */
  close(): void
  cancel(): void
}

export interface ProgrammaticCompose {
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  bodyHtml: string
}

export interface ReplyCandidate {
  threadId: string
  gmailMessageId: string
  senderAddress: string | null
  /** Short preview of body text for the auto-reply heuristic. */
  bodyPreview: string
}

export interface GmailAdapter {
  load(): Promise<void>
  onPresending(handler: (event: ComposeEvent) => Promise<void> | void): void
  /** Fires for every new message added to a thread view. The handler
   *  must decide whether the candidate is a tracked reply. */
  onIncomingMessage(handler: (candidate: ReplyCandidate) => void): void
  /** Open a brand-new compose populated with the given fields and send
   *  immediately. Used by scheduled-send dispatch. The send flows through
   *  the normal presend interception so it gets tracked + the row is
   *  minted as usual. */
  fireProgrammaticSend(spec: ProgrammaticCompose): Promise<void>
  /** Same as fireProgrammaticSend but the body already has tracking
   *  pixels + click URLs baked in. Used by mail-merge dispatch where
   *  the originating compose already minted the tracking row. The
   *  presend pipeline skips re-minting for this send. */
  dispatchPrebakedSend(spec: ProgrammaticCompose): Promise<void>
}
