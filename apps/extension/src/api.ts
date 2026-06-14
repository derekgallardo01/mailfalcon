import { config } from './config'

export interface MintEmailRequest {
  recipientCount: number
  links: string[]
}

export interface MintEmailResponse {
  id: string
  sig: string
}

export async function mintEmail(req: MintEmailRequest): Promise<MintEmailResponse> {
  const res = await fetch(`${config.apiHost}/v1/emails`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) {
    throw new Error(`mint failed: ${res.status} ${await res.text()}`)
  }
  return (await res.json()) as MintEmailResponse
}
