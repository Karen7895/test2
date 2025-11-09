(function () {
  const storyArticle = document.querySelector(".story-detail")
  if (!storyArticle) {
    return
  }

  const storyId = Number.parseInt(storyArticle.dataset.storyId, 10)
  if (!Number.isFinite(storyId)) {
    return
  }

  const SEND_INTERVAL = 5000
  let pendingPercentage = 0
  let lastSentPercentage = 0
  let lastDispatch = 0
  let sendTimeout = null
  let isSending = false

  function computeProgress() {
    const scrollElement = document.documentElement
    const scrollTop = window.scrollY || scrollElement.scrollTop || 0
    const viewportHeight = window.innerHeight || scrollElement.clientHeight
    const totalHeight = Math.max(scrollElement.scrollHeight, document.body.scrollHeight || 0)
    const maxScroll = totalHeight - viewportHeight

    if (maxScroll <= 0) {
      return 100
    }

    const ratio = Math.min(Math.max(scrollTop / maxScroll, 0), 1)
    return Math.round(ratio * 100)
  }

  function requestSend(force) {
    if (force) {
      if (sendTimeout) {
        clearTimeout(sendTimeout)
        sendTimeout = null
      }
      void transmitProgress(true)
      return
    }

    if (sendTimeout) {
      return
    }

    const elapsed = Date.now() - lastDispatch
    const delay = elapsed >= SEND_INTERVAL ? 0 : SEND_INTERVAL - elapsed
    sendTimeout = window.setTimeout(() => {
      sendTimeout = null
      void transmitProgress()
    }, delay)
  }

  async function transmitProgress(force = false) {
    if (isSending) {
      return
    }

    const percentage = force ? Math.max(pendingPercentage, lastSentPercentage) : pendingPercentage
    if (!force && percentage <= lastSentPercentage) {
      return
    }

    isSending = true
    lastDispatch = Date.now()

    try {
      await fetch("/library/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyId, percentage }),
        credentials: "same-origin",
      })
      lastSentPercentage = Math.max(lastSentPercentage, percentage)
      pendingPercentage = 0
    } catch (error) {
      console.error("Failed to record reading progress", error)
    } finally {
      isSending = false
    }
  }

  function handleProgressUpdate(force = false) {
    const percentage = Math.min(100, computeProgress())
    if (percentage <= lastSentPercentage && !force) {
      return
    }
    pendingPercentage = Math.max(pendingPercentage, percentage)
    requestSend(force)
  }

  window.addEventListener("scroll", () => handleProgressUpdate(false), { passive: true })
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      handleProgressUpdate(true)
    }
  })
  window.addEventListener("beforeunload", () => {
    handleProgressUpdate(true)
  })

  handleProgressUpdate(false)
})()
