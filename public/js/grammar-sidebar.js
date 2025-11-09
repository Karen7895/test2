;(function () {
  function onReady(callback) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true })
    } else {
      callback()
    }
  }

  function safeGetStorage(key) {
    try {
      return window.localStorage.getItem(key)
    } catch (error) {
      return null
    }
  }

  function safeSetStorage(key, value) {
    try {
      if (value) {
        window.localStorage.setItem(key, value)
      } else {
        window.localStorage.removeItem(key)
      }
    } catch (error) {
      /* ignore */
    }
  }

  function expandPanel(panel) {
    if (!panel) return
    panel.removeAttribute('hidden')
    panel.classList.add('is-animating')
    panel.style.height = panel.scrollHeight + 'px'
    const onEnd = function (event) {
      if (event.target !== panel || event.propertyName !== 'height') return
      panel.style.height = ''
      panel.classList.remove('is-animating')
      panel.removeEventListener('transitionend', onEnd)
    }
    panel.addEventListener('transitionend', onEnd)
  }

  function collapsePanel(panel) {
    if (!panel) return
    panel.classList.add('is-animating')
    panel.style.height = panel.scrollHeight + 'px'
    panel.offsetHeight // force repaint
    panel.style.height = '0px'
    const onEnd = function (event) {
      if (event.target !== panel || event.propertyName !== 'height') return
      panel.setAttribute('hidden', '')
      panel.style.height = ''
      panel.classList.remove('is-animating')
      panel.removeEventListener('transitionend', onEnd)
    }
    panel.addEventListener('transitionend', onEnd)
  }

  function closeSection(section) {
    if (!section) return
    section.classList.remove('is-open')
    const toggle = section.querySelector('[data-section-toggle]')
    const panel = section.querySelector('.grammar-sidebar__panel')
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'false')
    }
    if (panel) {
      collapsePanel(panel)
    }
  }

  function openSection(section) {
    if (!section) return
    section.classList.add('is-open')
    const toggle = section.querySelector('[data-section-toggle]')
    const panel = section.querySelector('.grammar-sidebar__panel')
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'true')
    }
    if (panel) {
      expandPanel(panel)
    }
  }

  onReady(function () {
    const sidebar = document.querySelector('[data-grammar-sidebar]')
    if (!sidebar) return

    const locale = sidebar.getAttribute('data-locale') || 'en'
    const storageKey = 'grammar:openSection:' + locale
    const currentSectionSlug = sidebar.getAttribute('data-current-section') || ''
    const storedSlug = safeGetStorage(storageKey)

    const sections = Array.from(sidebar.querySelectorAll('[data-grammar-section]'))

    sections.forEach(function (section) {
      const panel = section.querySelector('.grammar-sidebar__panel')
      if (!section.classList.contains('is-open')) {
        if (panel) {
          panel.setAttribute('hidden', '')
          panel.style.height = '0px'
        }
      } else if (panel) {
        panel.style.height = ''
      }
    })

    function setOpenSection(slug) {
      sections.forEach(function (section) {
        if (section.getAttribute('data-section-slug') === slug) {
          openSection(section)
        } else {
          closeSection(section)
        }
      })
      safeSetStorage(storageKey, slug)
    }

    const initialSlug = currentSectionSlug || storedSlug
    if (initialSlug) {
      setOpenSection(initialSlug)
    }

    sections.forEach(function (section) {
      const toggle = section.querySelector('[data-section-toggle]')
      if (!toggle) return

      toggle.addEventListener('click', function () {
        const slug = section.getAttribute('data-section-slug')
        const href = toggle.getAttribute('data-section-href')
        const isOpen = section.classList.contains('is-open')

        if (isOpen) {
          closeSection(section)
          safeSetStorage(storageKey, '')
        } else {
          setOpenSection(slug)
        }

        if (slug && slug !== currentSectionSlug && href) {
          window.location.href = href
        }
      })
    })
  })
})()
