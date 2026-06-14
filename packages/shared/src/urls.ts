export const DEFAULT_TRACKER_HOST = 'https://t.mailfalcon.app'
export const DEFAULT_API_HOST = 'https://api.mailfalcon.app'

export function pixelUrl(id: string, sig: string, host = DEFAULT_TRACKER_HOST): string {
  return `${host}/p/${id}.gif?s=${sig}`
}

export function clickUrl(
  id: string,
  linkIdx: number,
  sig: string,
  host = DEFAULT_TRACKER_HOST,
): string {
  return `${host}/c/${id}/${linkIdx}?s=${sig}`
}
