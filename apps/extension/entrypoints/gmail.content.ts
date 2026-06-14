export default defineContentScript({
  matches: ['https://mail.google.com/*'],
  runAt: 'document_idle',
  main() {
    console.log('[mailfalcon] gmail content script loaded')
    // InboxSDK + compose-view hook + pixel/link injection lands in next commit.
  },
})
