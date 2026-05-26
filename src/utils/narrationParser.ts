/**
 * Nigerian bank narration parser.
 *
 * Narrations from Nigerian banks follow recognisable channel prefixes and
 * embed stable artifacts — session/reference numbers and NUBAN account numbers —
 * that survive truncation across interbank network switches even when the human-
 * readable name portion is cut short or cased differently.
 *
 * This parser extracts those stable artifacts so Layer 2 can match on them
 * rather than on the fragile name string.
 */

export interface NarrationFingerprint {
  channel: string              // MOB, NIP, WEB, TRF, FIP, STAMP_DUTY, ATM, …
  direction: 'in' | 'out' | 'unknown'
  counterpartyName: string     // best-effort extracted name, uppercased
  referenceNumbers: string[]   // numeric sequences ≥ 8 digits (session IDs)
  nubanNumbers: string[]       // exactly 10-digit sequences (account numbers)
  normalized: string           // full narration lowercased + punctuation stripped
}

// Known Nigerian interbank channel prefixes and what they mean
interface ChannelMeta {
  channel: string
  direction?: 'in' | 'out'
  /** Which slash-segment index holds the counterparty name (0-based after splitting on '/') */
  nameIdx?: number
}

const CHANNEL_MAP: Record<string, ChannelMeta> = {
  'MOB/UTO': { channel: 'MOB', direction: 'out', nameIdx: 2 },  // mobile transfer out
  'MOB/UTU': { channel: 'MOB', direction: 'in',  nameIdx: 2 },  // mobile transfer in
  'MOB':     { channel: 'MOB',                    nameIdx: 1 },
  // NIP: NIP / BANK_CODE / COUNTERPARTY_NAME / NUBAN / SESSION_REF
  'NIP':     { channel: 'NIP',                    nameIdx: 2 },
  'NIPS':    { channel: 'NIP',                    nameIdx: 2 },
  'WEB':     { channel: 'WEB',                    nameIdx: 1 },
  'TRF':     { channel: 'TRF',                    nameIdx: 1 },
  'FIP':     { channel: 'FIP',                    nameIdx: 1 },
  'IBT':     { channel: 'IBT' },
  'ATM':     { channel: 'ATM', direction: 'out' },
  'POS':     { channel: 'POS', direction: 'out' },
  'CHQ':     { channel: 'CHQ' },
  'USSD':    { channel: 'USSD' },
}

function extractNumbers(text: string): { refs: string[]; nubans: string[] } {
  const allNums = text.match(/\d+/g) ?? []
  const refs = allNums.filter(n => n.length >= 8)
  const nubans = allNums.filter(n => n.length === 10)
  return { refs, nubans }
}

/**
 * Strip non-name tokens from a raw segment: remove numeric-heavy parts,
 * clean punctuation, collapse spaces, uppercase.
 */
function cleanNameSegment(raw: string): string {
  return raw
    .replace(/\d{5,}/g, ' ')   // remove long numeric runs
    .replace(/[^a-zA-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

export function parseNarration(narration: string): NarrationFingerprint {
  const text = narration.trim()
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  const { refs: referenceNumbers, nubans: nubanNumbers } = extractNumbers(text)

  // Split on '/' — most Nigerian bank narration patterns use this delimiter
  const parts = text.split('/').map(p => p.trim()).filter(Boolean)
  const upperParts = parts.map(p => p.toUpperCase())

  let channel = 'UNKNOWN'
  let direction: 'in' | 'out' | 'unknown' = 'unknown'
  let counterpartyName = ''
  let namePartIdx = -1

  // Try two-part prefix first (e.g. MOB/UTO), then single
  if (parts.length >= 2) {
    const twoKey = `${upperParts[0]}/${upperParts[1]}`
    if (CHANNEL_MAP[twoKey]) {
      const meta = CHANNEL_MAP[twoKey]!
      channel = meta.channel
      direction = meta.direction ?? 'unknown'
      namePartIdx = meta.nameIdx ?? 2
    }
  }

  if (channel === 'UNKNOWN' && parts.length >= 1) {
    const oneKey = upperParts[0]!
    if (CHANNEL_MAP[oneKey]) {
      const meta = CHANNEL_MAP[oneKey]!
      channel = meta.channel
      direction = meta.direction ?? 'unknown'
      namePartIdx = meta.nameIdx ?? 1
    }
  }

  // Handle STAMP DUTY as a special case (not slash-delimited the same way)
  if (text.toUpperCase().includes('STAMP DUTY')) {
    channel = 'STAMP_DUTY'
    direction = 'out'
  }

  // Extract counterparty name from the identified segment
  if (namePartIdx !== -1 && parts[namePartIdx]) {
    counterpartyName = cleanNameSegment(parts[namePartIdx]!)
  }

  // Fallback: if no channel matched, try to extract a name from the whole narration.
  // Take the longest alphabetic run that looks like a name (≥ 4 chars, not a keyword).
  if (!counterpartyName) {
    const skipWords = new Set(['from', 'to', 'for', 'via', 'the', 'and', 'payment', 'transfer', 'credit', 'debit'])
    const words = text.replace(/[^a-zA-Z\s]/g, ' ').split(/\s+/).filter(w => w.length >= 4 && !skipWords.has(w.toLowerCase()))
    if (words.length >= 1) {
      counterpartyName = words.slice(0, 3).join(' ').toUpperCase()
    }
  }

  return {
    channel,
    direction,
    counterpartyName,
    referenceNumbers,
    nubanNumbers,
    normalized,
  }
}

/**
 * Determine whether two counterparty names extracted from narrations refer to
 * the same entity, accounting for:
 *   - Network truncation (one is a prefix of the other)
 *   - Case differences
 *   - Minor token reordering
 */
export function namesMatch(a: string, b: string): boolean {
  if (!a || !b || a.length < 4 || b.length < 4) return false

  const na = a.toUpperCase().replace(/[^A-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim()
  const nb = b.toUpperCase().replace(/[^A-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim()

  if (na === nb) return true

  // Prefix match — handles truncation from the right
  const shorter = na.length <= nb.length ? na : nb
  const longer  = na.length <= nb.length ? nb : na
  if (shorter.length >= 6 && longer.startsWith(shorter)) return true

  // Significant token overlap
  const tokA = na.split(' ').filter(t => t.length >= 4)
  const tokB = new Set(nb.split(' ').filter(t => t.length >= 4))
  if (tokA.length === 0 || tokB.size === 0) return false
  const overlap = tokA.filter(t => tokB.has(t))
  const ratio = overlap.length / Math.min(tokA.length, tokB.size)
  return ratio >= 0.5 && overlap.length >= 1
}
