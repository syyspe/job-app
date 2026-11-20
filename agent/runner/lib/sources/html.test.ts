import { expect, test } from 'vitest'
import { htmlToText, jobPostingOf, linksOf } from './html.ts'

test('htmlToText drops script, style and head, and breaks lines at blocks', () => {
  const html = `<html><head><title>T</title></head><body>
    <style>p { color: red }</style><script>alert(1)</script>
    <h1>Role</h1><p>First   line<br>second line</p><ul><li>one</li><li>two</li></ul>
  </body></html>`

  expect(htmlToText(html)).toBe('Role\n\nFirst line\nsecond line\n\none\n\ntwo')
})

test('htmlToText decodes named and numeric entities and keeps unknown ones', () => {
  expect(htmlToText('<p>Ty&ouml;paikka &amp; &#228;&#x00E4; &nbsp;x &bogus;</p>')).toBe('Työpaikka & ää x &bogus;')
})

test('htmlToText collapses runs of blank lines and trims', () => {
  expect(htmlToText('<div></div><div></div><p>a</p><div></div><div></div><div></div><p>b</p><div></div>')).toBe('a\n\nb')
})

test('htmlToText drops comments', () => {
  expect(htmlToText('<p>a<!-- hidden -->b</p>')).toBe('ab')
})

test('linksOf returns each anchor with an href, decoded', () => {
  const html = `<a href="https://x.example/?a=1&amp;b=2">Go <b>there</b></a>
    <a name="top">no href</a><a href='https://y.example'>Y</a><a href=https://z.example>Z</a>`

  expect(linksOf(html)).toEqual([
    { href: 'https://x.example/?a=1&b=2', text: 'Go there' },
    { href: 'https://y.example', text: 'Y' },
    { href: 'https://z.example', text: 'Z' },
  ])
})

function ldJson(value: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(value)}</script>`
}

test('jobPostingOf reads the first JobPosting', () => {
  const html = ldJson({ '@type': 'BreadcrumbList' }) + ldJson({
    '@type': 'JobPosting',
    description: '<p>Build things.</p><p>Apply now.</p>',
    hiringOrganization: { '@type': 'Organization', name: ' Example Oy ' },
    validThrough: '2026-12-04T16:15:00+02:00',
  })

  expect(jobPostingOf(html)).toEqual({ text: 'Build things.\n\nApply now.', company: 'Example Oy', deadline: '2026-12-04' })
})

test('jobPostingOf accepts an organization given as a bare name, and a graph', () => {
  const html = ldJson({ '@graph': [{ '@type': 'WebPage' }, { '@type': 'JobPosting', description: 'Text', hiringOrganization: 'Virasto' }] })

  expect(jobPostingOf(html)).toEqual({ text: 'Text', company: 'Virasto' })
})

test('jobPostingOf is null without a JobPosting, or when the JSON does not parse', () => {
  expect(jobPostingOf('<p>No data</p>')).toBeNull()
  expect(jobPostingOf('<script type="application/ld+json">{ nope</script>')).toBeNull()
  expect(jobPostingOf(ldJson({ '@type': 'JobPosting' }))).toBeNull()
})
