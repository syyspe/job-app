import type { DraftOutput } from './draftOutput.ts'
import type { Ad, DraftUpload } from './jobApp.ts'

export interface DraftNaming {
  filePrefix: string
  // The run's date, YYYY-MM-DD, written into the saved ad's header.
  savedOn: string
}

type Language = DraftOutput['language']

const LABELS = {
  fi: {
    questions: 'Avoimet kysymykset',
    source: 'Lähde',
    applyTo: 'Hakuosoite',
    saved: 'Tallennettu',
    adFile: 'ilmoitus',
    askCompany: 'Mikä yritys ilmoituksen takana on? Ilmoitus ei kerro sitä.',
    askRole: 'Mikä tehtävänimike on? Ilmoitus ei kerro sitä.',
  },
  en: {
    questions: 'Open questions',
    source: 'Source',
    applyTo: 'Apply to',
    saved: 'Saved',
    adFile: 'ad',
    askCompany: 'Which company is this ad for? The ad does not say.',
    askRole: 'What is the job title? The ad does not say.',
  },
} as const

const COMPANY_PLACEHOLDER = 'Unknown company'
const ROLE_PLACEHOLDER = 'Unknown role'

interface Resolved {
  company: string
  role: string
  // Fixed open questions for a value neither the ad nor the model knew.
  missing: string[]
}

// The ad's value first, then what the model read from the ad text.
function resolveNames(ad: Ad, output: DraftOutput): Resolved {
  const labels = LABELS[output.language]
  const company = ad.company.trim() || output.company.trim()
  const role = ad.title.trim() || output.role.trim()
  const missing: string[] = []
  if (!company) missing.push(`company: ${labels.askCompany}`)
  if (!role) missing.push(`role: ${labels.askRole}`)
  return { company: company || COMPANY_PLACEHOLDER, role: role || ROLE_PLACEHOLDER, missing }
}

// Unicode letters, digits and '-' are kept; every other run becomes one '_'.
export function fileComponent(text: string): string {
  const joined = text.replaceAll(/[^\p{L}\p{N}-]+/gu, '_')
  const capped = joined.replaceAll(/^_+|_+$/g, '').slice(0, 40).replace(/_+$/, '')
  return capped || 'Unknown'
}

function notesOf(ad: Ad, output: DraftOutput, missing: string[]): string {
  const labels = LABELS[output.language]
  const questions = [...output.questions.map(({ id, text }) => `${id}: ${text}`), ...missing]
  const sections = [output.fitSummary.trim()]
  if (questions.length > 0) sections.push(`${labels.questions}:\n${questions.join('\n')}`)
  sections.push(`${ad.source}: ${ad.url}`)
  return sections.join('\n\n')
}

function savedAdText(ad: Ad, output: DraftOutput, savedOn: string): string {
  const labels = LABELS[output.language]
  const header = [
    `${labels.source}: ${ad.url}`,
    `${labels.applyTo}: ${output.applyTo.trim() || ad.url}`,
    `${labels.saved}: ${savedOn}`,
  ]
  return `${header.join('\n')}\n\n${ad.title}\n\n${ad.body ?? ''}\n`
}

interface FileNames {
  coverLetter: string
  cv: string
  ad: string
}

function fileNames(language: Language, names: Resolved, prefix: string): FileNames {
  const company = fileComponent(names.company)
  const suffix = language.toUpperCase()
  const letter = language === 'fi' ? 'Hakemus' : 'CoverLetter'
  return {
    coverLetter: `${prefix}_${letter}_${company}_${suffix}.txt`,
    cv: `${prefix}_CV_${company}_${suffix}.txt`,
    ad: `${company}_${fileComponent(names.role)}_${LABELS[language].adFile}.txt`,
  }
}

export function buildDraft(ad: Ad, output: DraftOutput, naming: DraftNaming): DraftUpload {
  const names = resolveNames(ad, output)
  const files = fileNames(output.language, names, fileComponent(naming.filePrefix))
  return {
    company: names.company,
    role: names.role,
    deadline: ad.deadline,
    link: ad.url,
    notes: notesOf(ad, output, names.missing),
    files: {
      coverLetter: { name: files.coverLetter, text: output.coverLetter },
      cv: { name: files.cv, text: output.cv },
      ad: { name: files.ad, text: savedAdText(ad, output, naming.savedOn) },
    },
  }
}
