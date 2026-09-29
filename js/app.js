/* First & Last: shared behavior
   1. CONFIG: the two values to fill in before the viability test.
   2. track(): counts events (page views, tool completions, paid-offer clicks).
   3. Fake-door modal: measures interest in paid offers before they exist. */

const CONFIG = {
  // Paste a form endpoint here (for example a Formspree URL) so emails from the
  // "notify me" modal reach you. While empty, emails are only kept in this browser.
  FORM_ENDPOINT: "",
  // Paste a GoatCounter site code here (for example "firstandlast") to count
  // visits and events without cookies. While empty, events are only kept in this browser.
  GOATCOUNTER_CODE: ""
};

/* ---------- Event tracking ---------- */
function track(eventName, detail) {
  const entry = { event: eventName, detail: detail || "", at: new Date().toISOString(), page: location.pathname };
  try {
    const log = JSON.parse(localStorage.getItem("fl_events") || "[]");
    log.push(entry);
    localStorage.setItem("fl_events", JSON.stringify(log.slice(-500)));
  } catch (e) { /* storage unavailable: carry on */ }
  if (CONFIG.GOATCOUNTER_CODE && window.goatcounter && window.goatcounter.count) {
    window.goatcounter.count({ path: "event/" + eventName, title: String(detail || ""), event: true });
  }
}

(function loadAnalytics() {
  if (!CONFIG.GOATCOUNTER_CODE) return;
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://gc.zgo.at/count.js";
  s.dataset.goatcounter = "https://" + CONFIG.GOATCOUNTER_CODE + ".goatcounter.com/count";
  document.head.appendChild(s);
})();

/* ---------- Fake-door modal ---------- */
function setupOffers() {
  const back = document.getElementById("offer-modal");
  if (!back) return;
  const title = back.querySelector("[data-offer-title]");
  const form = back.querySelector("form");
  const thanks = back.querySelector("[data-offer-thanks]");
  let current = "";

  document.querySelectorAll("[data-offer]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      current = btn.dataset.offer;
      title.textContent = btn.dataset.offerName || "This feature";
      form.classList.remove("hidden");
      thanks.classList.add("hidden");
      back.classList.add("open");
      track("offer_click", current);
      const input = form.querySelector("input[type=email]");
      if (input) input.focus();
    });
  });

  function close() { back.classList.remove("open"); }
  back.addEventListener("click", function (e) { if (e.target === back) close(); });
  back.querySelectorAll("[data-close]").forEach(function (b) { b.addEventListener("click", close); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    const email = form.querySelector("input[type=email]").value.trim();
    if (!email) return;
    track("offer_email", current);
    try {
      const leads = JSON.parse(localStorage.getItem("fl_leads") || "[]");
      leads.push({ email: email, offer: current, at: new Date().toISOString() });
      localStorage.setItem("fl_leads", JSON.stringify(leads));
    } catch (err) { /* ignore */ }
    if (CONFIG.FORM_ENDPOINT) {
      fetch(CONFIG.FORM_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ email: email, offer: current })
      }).catch(function () { /* the thank-you still shows */ });
    }
    form.classList.add("hidden");
    thanks.classList.remove("hidden");
    form.reset();
  });
}

/* ---------- Helpers shared by both tools ---------- */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function formatMoney(n) {
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function copyText(text, btn) {
  const done = function () {
    if (!btn) return;
    const old = btn.textContent;
    btn.textContent = "Copied";
    setTimeout(function () { btn.textContent = old; }, 1600);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, done);
  } else {
    const t = document.createElement("textarea");
    t.value = text; document.body.appendChild(t); t.select();
    try { document.execCommand("copy"); } catch (e) { /* ignore */ }
    t.remove(); done();
  }
}
function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
}

document.addEventListener("DOMContentLoaded", function () {
  setupOffers();
  track("page_view", document.title);
});
