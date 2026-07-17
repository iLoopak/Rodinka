// The server validates passwords but never generates them, so the temporary
// passphrase is built here and sent over TLS like any other credential the
// user would have typed. It is never persisted, logged, or echoed back.
//
// Words are deliberately short, concrete, and diacritic-free: a child types
// this once on whatever keyboard they have, and a Czech layout is not a given.
const WORDS = [
  'ryba', 'strom', 'kolo', 'mrak', 'lampa', 'kniha', 'hora', 'sova',
  'liska', 'medved', 'jablko', 'hruska', 'kvetina', 'motyl', 'zebra', 'tygr',
  'delfin', 'jezek', 'veverka', 'krtek', 'slunce', 'hvezda', 'kamen', 'reka',
  'most', 'zamek', 'balon', 'raketa', 'kytara', 'buben', 'vlak', 'lodka',
]

const MIN_NUMBER = 10
const NUMBER_RANGE = 90

// Math.random is not a credential source. crypto.getRandomValues is available
// in every browser this app supports and in the jsdom test environment.
function randomBelow(bound: number): number {
  const limit = Math.floor(0xffffffff / bound) * bound
  const buffer = new Uint32Array(1)
  // Rejection sampling: values at the tail of the uint32 range would bias
  // shorter words toward the front of the list under a plain modulo.
  let value = 0
  do {
    crypto.getRandomValues(buffer)
    value = buffer[0]
  } while (value >= limit)
  return value % bound
}

function randomWord(): string {
  return WORDS[randomBelow(WORDS.length)]
}

// Three words plus a two-digit number: ~40 bits of entropy against the public
// wordlist, comfortably above the server's 8-character floor, and still
// readable aloud to a child across the kitchen table.
export function generateChildPassphrase(): string {
  return `${randomWord()}-${randomWord()}-${randomWord()}-${MIN_NUMBER + randomBelow(NUMBER_RANGE)}`
}

export const CHILD_PASSWORD_MIN_LENGTH = 8
export const CHILD_PASSWORD_MAX_LENGTH = 128

export function isValidChildPassword(value: string): boolean {
  return value.length >= CHILD_PASSWORD_MIN_LENGTH && value.length <= CHILD_PASSWORD_MAX_LENGTH
}
