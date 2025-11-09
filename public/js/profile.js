document.addEventListener("DOMContentLoaded", () => {
  const tabButtons = Array.from(document.querySelectorAll("[data-profile-tab]"))
  const panels = Array.from(document.querySelectorAll("[data-profile-panel]"))
  const avatarInput = document.getElementById("profile-avatar-input")
  const avatarForm = document.getElementById("profile-avatar-form")
  const settingsForm = document.getElementById("profile-settings-form")
  const settingsStatus = document.getElementById("profile-settings-status")

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.profileTab
      tabButtons.forEach((btn) => {
        const isActive = btn === button
        btn.classList.toggle("is-active", isActive)
        btn.setAttribute("aria-selected", String(isActive))
      })

      panels.forEach((panel) => {
        const matches = panel.dataset.profilePanel === target
        panel.classList.toggle("is-active", matches)
        panel.hidden = !matches
      })
    })
  })

  if (avatarInput && avatarForm) {
    avatarInput.addEventListener("change", async () => {
      if (!avatarInput.files || !avatarInput.files.length) {
        return
      }

      const formData = new FormData()
      formData.append("avatar", avatarInput.files[0])

      try {
        const response = await fetch(avatarForm.action, {
          method: "POST",
          body: formData,
        })

        if (!response.ok) {
          throw new Error("Upload failed")
        }

        const data = await response.json()
        if (!data.success || !data.avatarUrl) {
          throw new Error("Upload failed")
        }

        updateAvatarSources(data.avatarUrl)
      } catch (error) {
        console.error("Avatar upload failed", error)
      } finally {
        avatarInput.value = ""
      }
    })
  }

  if (settingsForm) {
    settingsForm.addEventListener("submit", async (event) => {
      event.preventDefault()
      const formData = new FormData(settingsForm)
      const payload = Object.fromEntries(formData.entries())

      try {
        const response = await fetch(settingsForm.action, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          throw new Error("Settings update failed")
        }

        const data = await response.json()
        if (data.success && settingsStatus) {
          settingsStatus.hidden = false
          settingsStatus.classList.add("is-visible")
          setTimeout(() => {
            settingsStatus.hidden = true
            settingsStatus.classList.remove("is-visible")
          }, 3000)
        }
      } catch (error) {
        console.error("Failed to save settings", error)
      }
    })
  }

  function updateAvatarSources(url) {
    const avatarTargets = document.querySelectorAll("[data-profile-avatar]")
    avatarTargets.forEach((img) => {
      img.setAttribute("src", url)
    })

    const navAnchors = document.querySelectorAll(".nav-avatar")
    navAnchors.forEach((anchor) => {
      let img = anchor.querySelector(".navbar__avatar--image")
      if (!img) {
        img = document.createElement("img")
        img.className = "navbar__avatar navbar__avatar--image"
        img.width = 32
        img.height = 32
        img.alt = anchor.getAttribute("aria-label") || "Avatar"
        img.loading = "lazy"
        img.decoding = "async"
        anchor.innerHTML = ""
        anchor.appendChild(img)
      }
      img.setAttribute("src", url)
    })
  }
})
