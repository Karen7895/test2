;(function () {
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.quiz[data-quiz]').forEach(initQuiz)
    initGrammarSidebar()
  })

  function initQuiz(quizElement) {
    const dataNode = quizElement.querySelector('.quiz__data')
    if (!dataNode) {
      return
    }

    let quizData
    try {
      quizData = JSON.parse(dataNode.textContent)
    } catch (error) {
      console.warn('Invalid quiz data', error)
      return
    }

    const form = quizElement.querySelector('[data-quiz-form]')
    const startButton = quizElement.querySelector('[data-quiz-start]')
    const checkButton = quizElement.querySelector('[data-quiz-check]')
    const tryAgainButton = quizElement.querySelector('[data-quiz-try-again]')
    const showSolutionsButton = quizElement.querySelector('[data-quiz-show]')
    const resultsNode = quizElement.querySelector('[data-quiz-results]')
    const items = Array.from(form.querySelectorAll('[data-quiz-item]'))

    if (!form || !checkButton || !resultsNode || !quizData.items) {
      return
    }

    setInputsDisabled(items, true)

    if (startButton) {
      startButton.addEventListener('click', function () {
        form.reset()
        clearFeedback(items)
        setInputsDisabled(items, false)
        startButton.hidden = true
        checkButton.hidden = false
        tryAgainButton && (tryAgainButton.hidden = true)
        showSolutionsButton && (showSolutionsButton.hidden = true)
        resultsNode.hidden = true
        focusFirstInput(items)
      })
    } else {
      setInputsDisabled(items, false)
    }

    checkButton.addEventListener('click', function () {
      const evaluation = evaluateQuiz(items, quizData)
      displayResults(quizElement, resultsNode, quizData.items.length, evaluation.correct)
      checkButton.hidden = true
      tryAgainButton && (tryAgainButton.hidden = false)
      showSolutionsButton && (showSolutionsButton.hidden = false)
    })

    if (tryAgainButton) {
      tryAgainButton.addEventListener('click', function () {
        form.reset()
        clearFeedback(items)
        setInputsDisabled(items, false)
        checkButton.hidden = false
        tryAgainButton.hidden = true
        showSolutionsButton && (showSolutionsButton.hidden = true)
        resultsNode.hidden = true
        focusFirstInput(items)
      })
    }

    if (showSolutionsButton) {
      showSolutionsButton.addEventListener('click', function () {
        revealSolutions(items, quizData)
        setInputsDisabled(items, true)
        showSolutionsButton.hidden = true
      })
    }
  }

  function evaluateQuiz(items, quizData) {
    let correctCount = 0

    items.forEach(function (element) {
      const questionId = element.dataset.questionId
      const data = quizData.items.find(function (item) {
        return item.id === questionId
      })

      if (!data) {
        return
      }

      let isCorrect = false

      if (data.type === 'multiple-choice') {
        const selected = element.querySelector('input[type="radio"]:checked')
        if (selected) {
          const value = parseInt(selected.value, 10)
          isCorrect = value === data.answer
        }
      } else if (data.type === 'text') {
        const input = element.querySelector('input[type="text"]')
        if (input) {
          const value = (input.value || '').trim().toLowerCase()
          if (Array.isArray(data.answer)) {
            isCorrect = data.answer.some(function (entry) {
              return String(entry).trim().toLowerCase() === value
            })
          } else {
            isCorrect = String(data.answer || '').trim().toLowerCase() === value
          }
        }
      } else if (data.type === 'match') {
        isCorrect = true
        ;(data.pairs || []).forEach(function (pair) {
          const select = element.querySelector(`select[name="${pair.id}"]`)
          if (!select || select.value !== String(pair.answer)) {
            isCorrect = false
          }
        })
      }

      const feedback = element.querySelector('[data-quiz-feedback]')
      if (feedback) {
        feedback.textContent = isCorrect ? '✅' : '❌'
      }
      element.dataset.status = isCorrect ? 'correct' : 'incorrect'

      if (isCorrect) {
        correctCount += 1
      }
    })

    return { correct: correctCount }
  }

  function displayResults(container, node, total, score) {
    const scoreLabel = container.dataset.scoreLabel || 'Your score'
    const outOfLabel = container.dataset.outOfLabel || 'out of'
    const correctLabel = container.dataset.correctLabel || 'correct'
    const reviewLabel = container.dataset.reviewLabel || ''

    node.textContent = `${scoreLabel}: ${score} ${outOfLabel} ${total} ${correctLabel}`
    if (score < total && reviewLabel) {
      const reviewSpan = document.createElement('span')
      reviewSpan.className = 'quiz__review'
      reviewSpan.textContent = reviewLabel
      node.appendChild(document.createTextNode(' '))
      node.appendChild(reviewSpan)
    }
    node.hidden = false
  }

  function revealSolutions(items, quizData) {
    items.forEach(function (element) {
      const questionId = element.dataset.questionId
      const data = quizData.items.find(function (item) {
        return item.id === questionId
      })
      if (!data) {
        return
      }

      if (data.type === 'multiple-choice') {
        const radios = element.querySelectorAll('input[type="radio"]')
        radios.forEach(function (radio) {
          radio.checked = parseInt(radio.value, 10) === data.answer
        })
      } else if (data.type === 'text') {
        const input = element.querySelector('input[type="text"]')
        if (input) {
          if (Array.isArray(data.answer) && data.answer.length) {
            input.value = data.answer[0]
          } else if (data.answer) {
            input.value = data.answer
          }
        }
      } else if (data.type === 'match') {
        ;(data.pairs || []).forEach(function (pair) {
          const select = element.querySelector(`select[name="${pair.id}"]`)
          if (select) {
            select.value = String(pair.answer)
          }
        })
      }

      const feedback = element.querySelector('[data-quiz-feedback]')
      if (feedback) {
        feedback.textContent = '✅'
      }
      element.dataset.status = 'correct'
    })
  }

  function setInputsDisabled(items, disabled) {
    items.forEach(function (element) {
      element.querySelectorAll('input, select, textarea').forEach(function (input) {
        input.disabled = disabled
        if (!disabled && input.type === 'text') {
          input.value = ''
        }
        if (!disabled && input.type === 'radio') {
          input.checked = false
        }
        if (!disabled && input.tagName === 'SELECT') {
          input.selectedIndex = 0
        }
      })
      if (!disabled) {
        element.dataset.status = ''
      }
    })
  }

  function clearFeedback(items) {
    items.forEach(function (element) {
      const feedback = element.querySelector('[data-quiz-feedback]')
      if (feedback) {
        feedback.textContent = ''
      }
      element.dataset.status = ''
    })
  }

  function focusFirstInput(items) {
    const firstField = items[0]
    if (!firstField) {
      return
    }
    const input = firstField.querySelector('input, select, textarea')
    if (input && typeof input.focus === 'function') {
      input.focus()
    }
  }

  function initGrammarSidebar() {
    const sidebar = document.querySelector('[data-grammar-sidebar]')
    if (!sidebar) {
      return
    }

    const layout = sidebar.closest('[data-grammar-layout]')
    const overlay = layout ? layout.querySelector('[data-grammar-sidebar-overlay]') : null
    const toggleButtons = document.querySelectorAll('[data-grammar-sidebar-toggle]')
    const closeButton = sidebar.querySelector('[data-grammar-sidebar-close]')

    function openSidebar() {
      sidebar.classList.add('is-open')
      overlay && overlay.classList.add('is-active')
      layout && layout.classList.add('grammar-layout--sidebar-open')
      document.body.classList.add('grammar-sidebar-open')
      const firstLink = sidebar.querySelector('.grammar-sidebar__link')
      if (firstLink) {
        firstLink.focus()
      }
    }

    function closeSidebar() {
      sidebar.classList.remove('is-open')
      overlay && overlay.classList.remove('is-active')
      layout && layout.classList.remove('grammar-layout--sidebar-open')
      document.body.classList.remove('grammar-sidebar-open')
    }

    toggleButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        if (sidebar.classList.contains('is-open')) {
          closeSidebar()
        } else {
          openSidebar()
        }
      })
    })

    if (closeButton) {
      closeButton.addEventListener('click', closeSidebar)
    }

    if (overlay) {
      overlay.addEventListener('click', closeSidebar)
    }

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeSidebar()
      }
    })
  }
})()
