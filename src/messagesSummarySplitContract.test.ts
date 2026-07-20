import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// Wave 5 architectural pins. The split only pays off while the boundary
// holds: the moment something globally mounted imports the content layer,
// chat pages, reactions, attachments and signed URLs are startup work again.

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const shell = read('src/components/AppShell.tsx')
const providers = read('src/context/AppDataProviders.tsx')
const bell = read('src/components/messages/MessagesBell.tsx')
const shareButton = read('src/components/messages/ShareToChatButton.tsx')
const screen = read('src/components/messages/MessagesScreen.tsx')
const summarySource = read('src/context/messages/useMessagesSummarySource.ts')
const contentSource = read('src/context/messages/useMessagesContentSource.ts')

// Files that are allowed to reach into the route-scoped content layer: the
// Messages route itself and the UI it renders inside its own detail pane.
const CONTENT_CONSUMERS = new Set([
  'src/context/messages/MessagesContentContext.tsx',
  'src/components/messages/MessagesScreen.tsx',
  'src/components/messages/Composer.tsx',
  'src/components/messages/CreateFromMessageDialog.tsx',
  'src/components/messages/ShareExistingEntityDialog.tsx',
])

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(join(root, dir))) {
    const rel = `${dir}/${entry}`
    if (statSync(join(root, rel)).isDirectory()) sourceFiles(rel, acc)
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) acc.push(rel)
  }
  return acc
}

describe('messages summary / content boundary', () => {
  it('mounts only the summary provider globally', () => {
    expect(providers).toContain('MessagesSummaryProvider')
    expect(providers).not.toContain('MessagesContentProvider')
  })

  it('mounts the content provider from the Messages route', () => {
    expect(screen).toContain('MessagesContentProvider')
  })

  it('keeps the shell on the narrow active-conversation signal', () => {
    expect(shell).toContain('useActiveConversationId()')
    expect(shell).not.toContain('MessagesContentContext')
    expect(shell).not.toMatch(/\buseMessagesSummary\(/)
  })

  it('gives the header bell a single number to subscribe to', () => {
    expect(bell).toContain('useTotalUnreadCount()')
    expect(bell).not.toContain('MessagesContentContext')
  })

  it('lets the app-wide share button work without chat content', () => {
    expect(shareButton).not.toContain('MessagesContentContext')
    expect(shareButton).toContain('useMessagesActions()')
  })

  it('has no globally mounted importer of the content layer', () => {
    const offenders = sourceFiles('src')
      .filter((file) => !CONTENT_CONSUMERS.has(file.replace(/\\/g, '/')))
      .filter((file) => read(file).includes('MessagesContentContext'))
      .map((file) => relative('src', file))
    expect(offenders).toEqual([])
  })
})

describe('messages realtime ownership', () => {
  it('keeps conversation metadata and the messages table on the global channel', () => {
    expect(summarySource).toContain('`family:${familyId}:messages`')
    expect(summarySource).toContain("table: 'messages'")
    expect(summarySource).toContain("table: 'conversations'")
    expect(summarySource).toContain("table: 'conversation_members'")
  })

  it('never subscribes content-only tables globally', () => {
    expect(summarySource).not.toContain("table: 'message_reactions'")
    expect(summarySource).not.toContain("table: 'message_attachments'")
    expect(summarySource).not.toContain("table: 'message_entity_refs'")
  })

  it('gives the content layer its own channel and no second messages subscription', () => {
    expect(contentSource).toContain('`family:${familyId}:messages-content`')
    expect(contentSource).not.toContain("table: 'messages'")
    // Message rows reach the thread through the summary's stream instead.
    expect(contentSource).toContain('messageStream.subscribe')
  })
})

describe('startup fetch boundary', () => {
  it('keeps message content queries out of the globally mounted layer', () => {
    for (const table of ['messages', 'message_reactions', 'message_attachments']) {
      expect(summarySource).not.toContain(`.from('${table}')`)
    }
    expect(summarySource).not.toContain('resolve_message_entities')
    expect(summarySource).not.toContain('createSignedUrl')
  })

  it('keeps them in the route-scoped layer', () => {
    expect(contentSource).toContain(".from('messages')")
    expect(contentSource).toContain(".from('message_reactions')")
    expect(contentSource).toContain(".from('message_attachments')")
    expect(contentSource).toContain('resolve_message_entities')
  })
})

describe('push and presence survive the split', () => {
  it('keeps the service-worker handshake mounted above the routes', () => {
    expect(shell).toContain('useConversationPushBridge(activeConversationId)')
    const bridge = read('src/hooks/useConversationPushBridge.ts')
    expect(bridge).toContain('RODINKA_IS_CONVERSATION_OPEN')
    expect(bridge).toContain('RODINKA_OPEN_CONVERSATION')
  })

  it('stops claiming a conversation is open once the route unmounts', () => {
    expect(screen).toContain('useEffect(() => () => setActiveConversationId(null)')
  })
})
