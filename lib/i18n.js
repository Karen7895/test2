const fs = require('fs')
const path = require('path')

const SUPPORTED_LANGUAGES = ['de', 'en', 'es', 'ru', 'hy']
const DEFAULT_LANGUAGE = 'de'
const FALLBACK_LANGUAGE = 'en'

const localesDir = path.join(__dirname, '..', 'locales')
const grammarDictionaries = {}

SUPPORTED_LANGUAGES.forEach((locale) => {
  const filePath = path.join(localesDir, `${locale}.json`)
  try {
    const fileContents = fs.readFileSync(filePath, 'utf8')
    grammarDictionaries[locale] = JSON.parse(fileContents)
  } catch (error) {
    console.error(`Unable to load locale file for ${locale}:`, error)
  }
})

function normalizeLanguage(language) {
  const value = (language || '').toLowerCase()
  return SUPPORTED_LANGUAGES.includes(value) ? value : null
}

function determineLocale(req) {
  const queryLanguage = normalizeLanguage(req.query?.lang)
  if (queryLanguage) {
    if (req.session) {
      req.session.locale = queryLanguage
    }
    return queryLanguage
  }

  if (req.session && normalizeLanguage(req.session.locale)) {
    return req.session.locale.toLowerCase()
  }

  const accepted = req.acceptsLanguages?.(SUPPORTED_LANGUAGES)
  if (accepted) {
    if (Array.isArray(accepted)) {
      for (const item of accepted) {
        const normalized = normalizeLanguage(item)
        if (normalized) {
          return normalized
        }
      }
    } else {
      const normalized = normalizeLanguage(accepted)
      if (normalized) {
        return normalized
      }
    }
  }

  return DEFAULT_LANGUAGE
}

function getGrammarDictionary(locale) {
  const normalized = normalizeLanguage(locale)
  if (normalized && grammarDictionaries[normalized]) {
    return grammarDictionaries[normalized]
  }

  if (grammarDictionaries[FALLBACK_LANGUAGE]) {
    return grammarDictionaries[FALLBACK_LANGUAGE]
  }

  return grammarDictionaries[DEFAULT_LANGUAGE]
}

function getGrammarSections(locale) {
  const dictionary = getGrammarDictionary(locale)
  return Array.isArray(dictionary?.sections) ? dictionary.sections : []
}

function getGrammarMeta(locale) {
  const dictionary = getGrammarDictionary(locale)
  return dictionary?.grammar || { ui: {}, overview: {}, breadcrumbs: {} }
}

function getSection(locale, slug) {
  return getGrammarSections(locale).find((section) => section.slug === slug)
}

function getSubtopic(locale, sectionSlug, subtopicSlug) {
  const section = getSection(locale, sectionSlug)
  if (!section || !Array.isArray(section.subtopics)) {
    return null
  }
  return section.subtopics.find((item) => item.slug === subtopicSlug) || null
}

module.exports = {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  FALLBACK_LANGUAGE,
  determineLocale,
  normalizeLanguage,
  getGrammarDictionary,
  getGrammarSections,
  getGrammarMeta,
  getSection,
  getSubtopic,
}
