const STORAGE_KEY = "murmur-auth";
const MOOD_META = {
  happy: { label: "Happy", accent: "#d98360" },
  calm: { label: "Calm", accent: "#4d7c6a" },
  grateful: { label: "Grateful", accent: "#7b5c7f" },
  thoughtful: { label: "Thoughtful", accent: "#6c8ca8" },
  overwhelmed: { label: "Overwhelmed", accent: "#b86262" },
  exhausted: { label: "Exhausted", accent: "#8e7c5b" },
  sad: { label: "Sad", accent: "#8ca7c8" }
};

const PROMPTS = [
  "What is one tiny truth you need to honor today?",
  "What felt meaningful in the last 24 hours?",
  "What emotion is asking for attention right now?",
  "What moment felt quietly important today?",
  "What is one feeling you can name without judgment?"
];

const authView = document.getElementById("authView");
const appView = document.getElementById("appView");
const authForm = document.getElementById("authForm");
const nameField = document.getElementById("nameField");
const authSubmit = document.getElementById("authSubmit");
const signOutButton = document.getElementById("signOutButton");
const authStatus = document.getElementById("authStatus");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const nameInput = document.getElementById("nameInput");
const authModeButtons = document.querySelectorAll(".tab-button");

const entriesList = document.getElementById("entriesList");
const weeklyRecap = document.getElementById("weeklyRecap");
const contactList = document.getElementById("contactList");
const dailyPrompt = document.getElementById("dailyPrompt");
const todayDate = document.getElementById("todayDate");
const charCounter = document.getElementById("charCounter");
const reflectionInput = document.getElementById("reflection");
const moodSelect = document.getElementById("mood");
const privateToggle = document.getElementById("privateToggle");
const shareToggle = document.getElementById("shareToggle");
const circleField = document.getElementById("circleField");
const trustedCircle = document.getElementById("trustedCircle");
const filterButtons = document.querySelectorAll(".filter-chip");
const contactForm = document.getElementById("contactForm");
const contactName = document.getElementById("contactName");
const contactEmail = document.getElementById("contactEmail");
const exportJsonButton = document.getElementById("exportJsonButton");
const exportCsvButton = document.getElementById("exportCsvButton");

let authMode = "login";
let selectedMoodFilter = "all";
let currentUser = null;
let contacts = [];
let entries = [];
let recap = null;

function getStoredToken() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return parsed.token || null;
  } catch (error) {
    return null;
  }
}

function setStoredSession(token, user) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
}

function clearStoredSession() {
  localStorage.removeItem(STORAGE_KEY);
}

function api(pathname, options = {}) {
  const token = getStoredToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return fetch(pathname, {
    ...options,
    headers
  }).then(async (response) => {
    const text = await response.text();
    let payload = null;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch (error) {
      payload = text;
    }

    if (!response.ok) {
      throw new Error(payload?.message || "Request failed");
    }

    return payload;
  });
}

function renderPrompt() {
  const today = new Date();
  const formatted = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric"
  });
  todayDate.textContent = formatted;

  const index = (today.getFullYear() * 365 + today.getMonth() * 30 + today.getDate()) % PROMPTS.length;
  dailyPrompt.textContent = PROMPTS[index];
}

function setAuthMode(nextMode) {
  authMode = nextMode;
  const isRegister = nextMode === "register";
  nameField.classList.toggle("hidden", !isRegister);
  authSubmit.textContent = isRegister ? "Create account" : "Log in";

  authModeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.auth === nextMode);
  });
}

function updateCounter() {
  charCounter.textContent = `${reflectionInput.value.length} / 400`;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function getMoodMeta(mood) {
  return MOOD_META[mood] || { label: mood, accent: "#7b5c7f" };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderContacts() {
  if (!contacts.length) {
    contactList.innerHTML = "<li class='empty-contact'>No trusted contacts yet.</li>";
    return;
  }

  contactList.innerHTML = contacts
    .map(
      (contact) => `
        <li class="contact-item">
          <div>
            <strong>${escapeHtml(contact.name)}</strong>
            <span>${escapeHtml(contact.email)}</span>
          </div>
        </li>
      `
    )
    .join("");
}

function renderTrustedCircleOptions() {
  const selected = Array.from(trustedCircle.selectedOptions).map((option) => option.value);
  trustedCircle.innerHTML = contacts
    .map(
      (contact) => `
        <option value="${escapeHtml(contact.email)}" ${selected.includes(contact.email) ? "selected" : ""}>${escapeHtml(contact.name)} (${escapeHtml(contact.email)})</option>
      `
    )
    .join("");
}

function renderRecap() {
  if (!recap) {
    weeklyRecap.innerHTML = "<div class='empty-state'>Your emotional summary will appear here.</div>";
    return;
  }

  const topMood = recap.topMood ? getMoodMeta(recap.topMood.mood) : null;

  weeklyRecap.innerHTML = `
    <div class="metric-box">
      <strong>${recap.total}</strong>
      <span>murmurs in the last 7 days</span>
    </div>
    <div class="metric-box">
      <strong>${topMood ? topMood.label : "—"}</strong>
      <span>most common mood</span>
    </div>
    <div class="metric-box">
      <strong>${recap.shared}</strong>
      <span>shared entries</span>
    </div>
    <div class="chart-box">
      <p class="eyebrow">7-day rhythm</p>
      <div class="chart-bars">
        ${recap.dayCounts
          .map(
            (day) => `
              <div class="bar-group">
                <div class="bar-track">
                  <div class="bar" style="height: ${(day.count / Math.max(1, Math.max(...recap.dayCounts.map((entry) => entry.count))) || 0) * 100}%"></div>
                </div>
                <span>${day.label}</span>
                <strong>${day.count}</strong>
              </div>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderEntries() {
  const filteredEntries = selectedMoodFilter === "all"
    ? entries
    : entries.filter((entry) => entry.mood === selectedMoodFilter);

  if (!filteredEntries.length) {
    entriesList.innerHTML = `
      <div class="empty-state">
        <h4>No murmurs yet for this mood.</h4>
        <p>Capture one small truth and it will appear here.</p>
      </div>
    `;
    return;
  }

  entriesList.innerHTML = filteredEntries
    .map((entry) => {
      const mood = getMoodMeta(entry.mood);
      const shareSummary = entry.privacy === "private"
        ? "Private"
        : entry.share_with && entry.share_with.length
          ? `Shared with ${entry.share_with.join(", ")}`
          : "Shared with trusted circle";

      return `
        <article class="entry-card">
          <div class="entry-top">
            <div class="entry-meta">
              <span class="entry-date">${formatDate(entry.created_at)}</span>
              <span class="entry-mood" style="background:${mood.accent}22; color:${mood.accent};">${mood.label}</span>
            </div>
            <span class="share-pill">${entry.privacy === "private" ? "Private" : "Shared"}</span>
          </div>
          <p>${escapeHtml(entry.text)}</p>
          <div class="entry-share">
            <span>${shareSummary}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function handleAuthSubmit(event) {
  event.preventDefault();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const name = nameInput.value.trim();

  const payload = authMode === "register"
    ? { name, email, password }
    : { email, password };

  const endpoint = authMode === "register" ? "/api/register" : "/api/login";

  api(endpoint, {
    method: "POST",
    body: JSON.stringify(payload)
  })
    .then((response) => {
      setStoredSession(response.token, response.user);
      currentUser = response.user;
      authForm.reset();
      renderApp();
    })
    .catch((error) => {
      alert(error.message);
    });
}

function renderApp() {
  const token = getStoredToken();
  if (!token) {
    authView.classList.remove("hidden");
    appView.classList.add("hidden");
    authStatus.textContent = "Offline demo";
    signOutButton.classList.add("hidden");
    return;
  }

  authView.classList.add("hidden");
  appView.classList.remove("hidden");
  authStatus.innerHTML = '<span class="dot"></span> Signed in';
  signOutButton.classList.remove("hidden");

  loadEntries();
  loadContacts();
  loadRecap();
}

function loadEntries() {
  api("/api/entries")
    .then((response) => {
      entries = response.entries || [];
      renderEntries();
    })
    .catch((error) => {
      console.error(error);
      entries = [];
      renderEntries();
    });
}

function loadContacts() {
  api("/api/contacts")
    .then((response) => {
      contacts = response.contacts || [];
      renderContacts();
      renderTrustedCircleOptions();
    })
    .catch((error) => {
      console.error(error);
      contacts = [];
      renderContacts();
    });
}

function loadRecap() {
  api("/api/recap")
    .then((response) => {
      recap = response;
      renderRecap();
    })
    .catch((error) => {
      console.error(error);
      recap = null;
      renderRecap();
    });
}

function handleEntrySubmit(event) {
  event.preventDefault();
  const text = reflectionInput.value.trim();
  if (!text) {
    reflectionInput.focus();
    return;
  }

  const selectedContacts = Array.from(trustedCircle.selectedOptions).map((option) => option.value);
  const payload = {
    mood: moodSelect.value,
    text,
    privacy: privateToggle.checked ? "private" : "shared",
    share_with: shareToggle.checked ? selectedContacts : []
  };

  api("/api/entries", {
    method: "POST",
    body: JSON.stringify(payload)
  })
    .then(() => {
      formReset();
      loadEntries();
      loadRecap();
    })
    .catch((error) => {
      alert(error.message);
    });
}

function formReset() {
  document.getElementById("entryForm").reset();
  moodSelect.value = "calm";
  privateToggle.checked = true;
  shareToggle.checked = false;
  circleField.hidden = true;
  reflectionInput.value = "";
  updateCounter();
}

function handleContactSubmit(event) {
  event.preventDefault();
  const name = contactName.value.trim();
  const email = contactEmail.value.trim();

  if (!name || !email) {
    alert("Please provide a name and email for the trusted contact.");
    return;
  }

  api("/api/contacts", {
    method: "POST",
    body: JSON.stringify({ name, email })
  })
    .then(() => {
      contactForm.reset();
      loadContacts();
    })
    .catch((error) => {
      alert(error.message);
    });
}

function handleSignOut() {
  clearStoredSession();
  currentUser = null;
  entries = [];
  contacts = [];
  recap = null;
  authForm.reset();
  document.getElementById("entryForm").reset();
  renderApp();
}

function exportEntries(type) {
  const path = `/api/export?type=${type}`;
  const token = getStoredToken();

  fetch(path, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  })
    .then((response) => response.blob())
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `murmur-export.${type}`;
      link.click();
      URL.revokeObjectURL(url);
    })
    .catch((error) => {
      console.error(error);
      alert("Unable to export entries");
    });
}

authModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setAuthMode(button.dataset.auth);
  });
});

authForm.addEventListener("submit", handleAuthSubmit);

document.getElementById("entryForm").addEventListener("submit", handleEntrySubmit);
shareToggle.addEventListener("change", () => {
  circleField.hidden = !shareToggle.checked;
  if (!shareToggle.checked) {
    trustedCircle.selectedIndex = -1;
  }
});

contactForm.addEventListener("submit", handleContactSubmit);
signOutButton.addEventListener("click", handleSignOut);
exportJsonButton.addEventListener("click", () => exportEntries("json"));
exportCsvButton.addEventListener("click", () => exportEntries("csv"));

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectedMoodFilter = button.dataset.filter;
    filterButtons.forEach((item) => item.classList.toggle("active", item === button));
    renderEntries();
  });
});

reflectionInput.addEventListener("input", updateCounter);

renderPrompt();
updateCounter();
setAuthMode("login");
renderApp();
