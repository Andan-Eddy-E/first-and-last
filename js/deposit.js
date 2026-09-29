/* Deposit Back: verdict, timeline, letter, next steps.
   Legal basis (verified September 2026):
   - NY General Obligations Law 7-108(1-a): one-month cap; itemized statement and
     return within 14 days of vacating; forfeiture if missed; landlord bears burden
     of proof; up to 2x punitive damages for willful violations. The text exempts
     rent-controlled units. The NY Attorney General's guide describes a
     "reasonable time" standard for rent-regulated units.
   - NY General Obligations Law 7-103: the deposit remains the tenant's money,
     held in trust by the landlord.
   - NYC Small Claims Court hears money claims up to $10,000. */

(function () {
  const DAY = 86400000;
  const RESPONSE_DAYS = 10;
  const $ = function (id) { return document.getElementById(id); };

  function parseLocalDate(value) {
    const p = value.split("-").map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function daysBetween(a, b) { return Math.round((b - a) / DAY); }
  function longDate(d) { return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }); }
  function shortDate(d) { return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  function today() { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); }

  /* ---------- Decide which situation the tenant is in ---------- */
  function assess(input) {
    const now = today();
    const deadline = addDays(input.moveOut, 14);
    const daysOut = daysBetween(input.moveOut, now);
    const daysLate = daysBetween(deadline, now);
    const owed = Math.max(0, input.deposit - input.returned);
    const overCap = input.rent > 0 && input.deposit > input.rent + 0.005;
    const base = { now: now, deadline: deadline, daysOut: daysOut, daysLate: daysLate, owed: owed, overCap: overCap, replyBy: addDays(now, RESPONSE_DAYS) };

    if (input.unitType === "controlled") return Object.assign(base, { kind: "regulated" });
    if (input.statement === "ontime") return Object.assign(base, { kind: "dispute" });
    if (daysOut <= 14 && input.statement === "none") return Object.assign(base, { kind: "waiting" });
    return Object.assign(base, { kind: "forfeited" });
  }

  /* ---------- Verdict card ---------- */
  function renderVerdict(input, a) {
    const box = $("verdict");
    let cls, tag, head, body;
    if (a.kind === "forfeited") {
      cls = "bad"; tag = "Deadline missed";
      head = input.statement === "late"
        ? "The itemized statement came too late to count."
        : "Your landlord is " + a.daysLate + " day" + (a.daysLate === 1 ? "" : "s") + " past the legal deadline.";
      body = "<p>Under New York law, a landlord who does not return the deposit with an itemized statement within 14 days of move-out <strong>forfeits the right to keep any part of it</strong>. That deadline was " + longDate(a.deadline) + ". On these facts you can demand the full unreturned amount:</p>" +
        "<p class='money'>" + formatMoney(a.owed) + "</p>" +
        "<p class='small'>A court can also award up to twice the deposit in punitive damages if the violation was willful.</p>";
    } else if (a.kind === "dispute") {
      cls = "warn"; tag = "Deductions in dispute";
      head = "Your landlord met the deadline, but the deductions still have to be justified.";
      body = "<p>The landlord may keep money only for unpaid rent, unpaid utilities owed to the landlord, damage beyond ordinary wear and tear, or moving and storage of your belongings. <strong>The landlord carries the burden of proving each deduction is reasonable.</strong> Routine cleaning, repainting after a normal tenancy, and worn carpet are ordinary wear and tear. The amount in dispute:</p>" +
        "<p class='money'>" + formatMoney(a.owed) + "</p>";
    } else if (a.kind === "waiting") {
      const left = 14 - a.daysOut;
      cls = "info"; tag = "Clock still running";
      head = left === 0 ? "Today is the deadline." : "Your landlord has " + left + " more day" + (left === 1 ? "" : "s") + ".";
      body = "<p>The 14-day deadline is <strong>" + longDate(a.deadline) + "</strong>. You do not have a violation yet, but a short, polite letter now puts your forwarding address on record and makes the deadline hard to ignore. If the date passes with no statement and no check, come back and run this again.</p>" +
        "<p class='money'>" + formatMoney(a.owed) + " outstanding</p>";
    } else {
      cls = "warn"; tag = "Different standard";
      head = "Rent-controlled apartments follow a different rule.";
      body = "<p>The 14-day statute exempts rent-controlled units. For those, the NY Attorney General's guidance says the deposit must come back at the end of the lease or within a <strong>reasonable time</strong> after. You have been out for " + a.daysOut + " days. Your letter below relies on that standard and on the rule that the deposit is still your money, held in trust.</p>" +
        "<p class='money'>" + formatMoney(a.owed) + " outstanding</p>";
    }
    let notes = "";
    if (input.unitType === "stabilized" && a.kind !== "regulated") {
      notes += "<p class='notice'><strong>Rent-stabilized units:</strong> the statute's text exempts only rent-controlled apartments, but the Attorney General's guide describes a \"reasonable time\" standard for all regulated units. Your letter cites the 14-day rule and the reasonable-time standard together, so it holds either way.</p>";
    }
    if (input.unitType === "unsure") {
      notes += "<p class='notice'><strong>Not sure about your unit?</strong> Most NYC apartments that are not rent controlled fall under the 14-day rule. You can request your apartment's rent history from <a href='https://hcr.ny.gov/tenant-resources'>NYS Homes and Community Renewal</a> to check its status.</p>";
    }
    if (a.overCap) {
      notes += "<p class='notice'><strong>Your deposit was over the legal cap.</strong> Deposits and advances cannot exceed one month's rent. You paid " + formatMoney(input.deposit) + " against rent of " + formatMoney(input.rent) + ". The letter mentions this.</p>";
    }
    box.className = "card verdict " + cls;
    box.innerHTML = "<span class='tag'>" + tag + "</span><h2>" + head + "</h2>" + body + notes;
  }

  /* ---------- Timeline (inline SVG) ---------- */
  function renderTimeline(input, a) {
    const X0 = 80, X1 = 880, Y = 110, GAP = 165;
    let events = [
      { date: input.moveOut, label: "Moved out", cls: "" },
      { date: a.deadline, label: "14-day deadline", cls: "deadline" },
      { date: a.now, label: "Today", cls: "today" },
      { date: a.replyBy, label: "Reply-by date in your letter", cls: "" }
    ];
    if (a.kind === "regulated") events[1].label = "Day 14 (for reference)";
    events.sort(function (p, q) { return p.date - q.date || (p.cls === "today" ? 1 : -1); });

    const start = events[0].date, span = Math.max(1, events[events.length - 1].date - start);
    events.forEach(function (e) { e.x = X0 + ((e.date - start) / span) * (X1 - X0); });
    for (let i = 1; i < events.length; i++) events[i].x = Math.max(events[i].x, events[i - 1].x + GAP);
    if (events[events.length - 1].x > X1) {
      events[events.length - 1].x = X1;
      for (let i = events.length - 2; i >= 0; i--) events[i].x = Math.min(events[i].x, events[i + 1].x - GAP);
    }

    const vertical = window.innerWidth < 640;
    if (vertical) {
      // Phone layout: evenly spaced vertical timeline with labels to the right.
      const STEP = 84, VX = 28, top = 26;
      let v = "<svg viewBox='0 0 340 " + (top * 2 + STEP * (events.length - 1)) + "' style='min-width:0' role='img' aria-label='Timeline from move-out to the reply-by date in your letter'>";
      for (let i = 0; i < events.length - 1; i++) {
        const mid = new Date((events[i].date.getTime() + events[i + 1].date.getTime()) / 2);
        let cls = "tl-future";
        if (mid < a.now) cls = mid < a.deadline ? "tl-window" : (a.kind === "regulated" ? "tl-axis" : "tl-over");
        v += "<line class='" + cls + "' x1='" + VX + "' y1='" + (top + STEP * i) + "' x2='" + VX + "' y2='" + (top + STEP * (i + 1)) + "'/>";
      }
      events.forEach(function (e, i) {
        const y = top + STEP * i;
        v += "<circle class='tl-dot " + e.cls + "' cx='" + VX + "' cy='" + y + "' r='" + (e.cls === "today" ? 11 : 9) + "'/>";
        v += "<text class='tl-label' style='font-size:15px' x='" + (VX + 26) + "' y='" + (y - 1) + "'>" + escapeHtml(e.label) + "</text>";
        v += "<text class='tl-date' style='font-size:13px' x='" + (VX + 26) + "' y='" + (y + 18) + "'>" + shortDate(e.date) + "</text>";
      });
      v += "</svg>";
      $("timeline").innerHTML = v + "<p class='small' style='margin:10px 4px 0'>" + captionFor(a) + "</p>";
      return;
    }

    let svg = "<svg viewBox='0 0 960 220' role='img' aria-label='Timeline from move-out to the reply-by date in your letter'>";
    for (let i = 0; i < events.length - 1; i++) {
      const mid = new Date((events[i].date.getTime() + events[i + 1].date.getTime()) / 2);
      let cls = "tl-future";
      if (mid < a.now) cls = mid < a.deadline ? "tl-window" : (a.kind === "regulated" ? "tl-axis" : "tl-over");
      svg += "<line class='" + cls + "' x1='" + events[i].x + "' y1='" + Y + "' x2='" + events[i + 1].x + "' y2='" + Y + "'/>";
    }
    events.forEach(function (e, i) {
      const up = i % 2 === 0;
      const ly = up ? Y - 52 : Y + 58;
      const anchor = i === 0 ? "start" : (i === events.length - 1 ? "end" : "middle");
      const tx = i === 0 ? e.x - 12 : (i === events.length - 1 ? e.x + 12 : e.x);
      svg += "<line class='tl-stem' x1='" + e.x + "' y1='" + (up ? Y - 14 : Y + 14) + "' x2='" + e.x + "' y2='" + (up ? Y - 30 : Y + 30) + "'/>";
      svg += "<circle class='tl-dot " + e.cls + "' cx='" + e.x + "' cy='" + Y + "' r='" + (e.cls === "today" ? 11 : 9) + "'/>";
      svg += "<text class='tl-label' x='" + tx + "' y='" + ly + "' text-anchor='" + anchor + "'>" + escapeHtml(e.label) + "</text>";
      svg += "<text class='tl-date' x='" + tx + "' y='" + (ly + 18) + "' text-anchor='" + anchor + "'>" + shortDate(e.date) + "</text>";
    });
    svg += "</svg>";
    $("timeline").innerHTML = svg + "<p class='small' style='margin:10px 4px 0'>" + captionFor(a) + "</p>";
  }

  function captionFor(a) {
    let caption = "";
    if (a.kind === "forfeited") caption = "Green is the landlord's 14-day window. Red is time past the deadline: " + a.daysLate + " day" + (a.daysLate === 1 ? "" : "s") + " and counting.";
    else if (a.kind === "waiting") caption = "Green is the time already used. The dotted line is what remains of the window and your reply-by date.";
    else if (a.kind === "dispute") caption = "The statement arrived inside the window, so the question now is whether each deduction can be proven reasonable.";
    else caption = "The 14-day rule does not bind rent-controlled units, but the longer the delay, the harder it is to call it reasonable.";
    return caption;
  }

  /* ---------- Letter ---------- */
  function buildLetter(input, a) {
    const tenant = input.tenantName || "[YOUR NAME]";
    const tenantAddr = input.tenantAddr || "[YOUR CURRENT MAILING ADDRESS]";
    const landlord = input.landlordName || "[LANDLORD OR MANAGEMENT COMPANY]";
    const landlordAddr = input.landlordAddr || "[LANDLORD'S MAILING ADDRESS]";
    const rental = input.rentalAddr || "[ADDRESS OF THE APARTMENT]";
    const stabilizedLine = input.unitType === "stabilized"
      ? " To the extent the premises are rent regulated, the deposit was in any event due at the end of the tenancy or within a reasonable time after, and that time has passed."
      : "";

    const head = longDate(a.now) + "\n\n" +
      "VIA CERTIFIED MAIL, RETURN RECEIPT REQUESTED\n\n" +
      landlord + "\n" + landlordAddr + "\n\n" +
      "Re: " + (a.kind === "waiting" ? "Return of security deposit" : "Demand for return of security deposit") + "\n" +
      "Premises: " + rental + "\n\n" +
      "Dear " + landlord + ":\n\n";

    const facts = "I was the tenant at the premises above and vacated on " + longDate(input.moveOut) + ". I paid a security deposit of " + formatMoney(input.deposit) + "." +
      (input.returned > 0 ? " To date I have received " + formatMoney(input.returned) + "." : " To date none of it has been returned.") + "\n\n";

    let body;
    if (a.kind === "forfeited") {
      body = facts +
        "New York General Obligations Law Section 7-108(1-a)(e) required you to provide an itemized statement of any deductions, together with the balance of the deposit, within fourteen days after I vacated. That deadline was " + longDate(a.deadline) + ". " +
        (input.statement === "late" ? "The statement you sent arrived after that date. " : "I received no itemized statement by that date. ") +
        "The statute is explicit about the consequence: a landlord who fails to provide the statement and deposit within fourteen days forfeits any right to retain any portion of the deposit." + stabilizedLine + "\n\n" +
        "I therefore demand payment of " + formatMoney(a.owed) + ", the full unreturned balance, by " + longDate(a.replyBy) + ".\n\n";
    } else if (a.kind === "dispute") {
      body = facts +
        "I received your itemized statement and I dispute the deductions. Under General Obligations Law Section 7-108(1-a)(b), a deposit may be retained only for unpaid rent, unpaid utility charges payable to the landlord, damage beyond ordinary wear and tear, and the cost of moving or storing a tenant's belongings. Under Section 7-108(1-a)(f), the landlord bears the burden of proving that any amount retained is reasonable.\n\n" +
        "The deductions taken are for [DESCRIBE, for example: repainting and general cleaning]. These reflect ordinary wear and tear from normal use over the tenancy and are not chargeable to me. I left the apartment [clean and undamaged / in the condition shown in my move-out photos dated ___].\n\n" +
        "I therefore demand payment of " + formatMoney(a.owed) + " by " + longDate(a.replyBy) + ". If you maintain that any deduction is proper, please send receipts, invoices, and photographs supporting each item by the same date.\n\n";
    } else if (a.kind === "waiting") {
      body = facts +
        "I am writing to confirm my forwarding address and to note the timing that applies. Under General Obligations Law Section 7-108(1-a)(e), the deposit, along with an itemized statement of any deductions, is due within fourteen days after I vacated, which is " + longDate(a.deadline) + ". A landlord who misses that date forfeits the right to retain any portion of the deposit.\n\n" +
        "Please send the deposit of " + formatMoney(a.owed) + " and any itemized statement to me at the address below by that date.\n\n";
    } else {
      body = facts +
        "Under General Obligations Law Section 7-103, a security deposit remains the money of the tenant and is held by the landlord in trust. It must be returned, less any lawful deduction, at the end of the tenancy or within a reasonable time after. I vacated " + a.daysOut + " days ago. That is well beyond a reasonable time, and I have received no accounting of any claimed deduction.\n\n" +
        "I therefore demand payment of " + formatMoney(a.owed) + " by " + longDate(a.replyBy) + ", together with a written explanation of any amount you claim a right to retain.\n\n";
    }

    const cap = a.overCap
      ? "I also note that the deposit of " + formatMoney(input.deposit) + " exceeded one month's rent of " + formatMoney(input.rent) + ", which General Obligations Law Section 7-108(1-a)(a) does not permit.\n\n"
      : "";

    const close = a.kind === "waiting"
      ? "Thank you for your prompt attention.\n\n"
      : "If I do not receive payment by that date, I intend to file a claim in the Small Claims Part of the New York City Civil Court. I will ask the court for the full amount owed and, because a willful violation of Section 7-108(1-a) exposes a landlord to punitive damages of up to twice the deposit, for those damages as well. I would prefer to resolve this without a court filing.\n\n";

    return head + body + cap + close +
      "Please send payment to:\n" + tenant + "\n" + tenantAddr + "\n\n" +
      "Sincerely,\n\n\n" + tenant + "\n";
  }

  /* ---------- Next steps ---------- */
  function renderSteps(a) {
    const steps = [];
    if (a.kind === "dispute") steps.push("<strong>Fill in the bracketed parts.</strong> Name the deductions you dispute and say what condition you left the apartment in. Specifics matter more than tone.");
    steps.push("<strong>Send it two ways.</strong> USPS Certified Mail with return receipt (about $10 at any post office) plus email if you have an address. Keep the receipt and a copy of the letter.");
    steps.push("<strong>Gather your evidence now.</strong> Your lease, proof you paid the deposit, move-out photos or video, the date you returned keys, and every message with the landlord.");
    if (a.kind === "waiting") {
      steps.push("<strong>Mark " + longDate(a.deadline) + " on your calendar.</strong> If it passes with no check and no itemized statement, run this tool again. Your letter will change from a reminder to a demand.");
    } else {
      steps.push("<strong>Wait until " + longDate(a.replyBy) + ".</strong> Many landlords pay once they see the statute cited. If you get a partial payment, you can accept it and still pursue the rest. Do not sign anything calling it payment in full.");
      steps.push("<strong>If the date passes, file in small claims court.</strong> NYC Small Claims hears money claims up to $10,000, the filing fee is about $15 to $20, you do not need a lawyer, and hearings are usually in the evening. Start at the <a href='https://www.nycourts.gov/new-york-city-small-claims-court/nyc-small-claims-court-legal-information'>NYC Small Claims Court page</a>.");
      steps.push("<strong>You can also complain to the Attorney General.</strong> The NY Attorney General's office takes security deposit complaints and mediates them for free. <a href='https://ag.ny.gov/file-complaint'>File a complaint</a>.");
    }
    $("next-steps").innerHTML = steps.map(function (s) { return "<li>" + s + "</li>"; }).join("");
  }

  /* ---------- Wire up the form ---------- */
  function readForm() {
    return {
      moveOutRaw: $("moveOut").value,
      unitType: $("unitType").value,
      statement: $("statement").value,
      deposit: parseFloat($("deposit").value),
      returned: parseFloat($("returned").value) || 0,
      rent: parseFloat($("rent").value) || 0,
      tenantName: $("tenantName").value.trim(),
      landlordName: $("landlordName").value.trim(),
      tenantAddr: $("tenantAddr").value.trim(),
      landlordAddr: $("landlordAddr").value.trim(),
      rentalAddr: $("rentalAddr").value.trim()
    };
  }

  function run(e) {
    if (e) e.preventDefault();
    const err = $("form-error");
    err.textContent = "";
    const input = readForm();
    if (!input.moveOutRaw) { err.textContent = "Please enter the date you moved out."; $("moveOut").focus(); return; }
    input.moveOut = parseLocalDate(input.moveOutRaw);
    if (input.moveOut > today()) { err.textContent = "That move-out date is in the future. The clock starts once you have actually moved out."; return; }
    if (!(input.deposit > 0)) { err.textContent = "Please enter the deposit amount you paid."; $("deposit").focus(); return; }
    if (input.returned >= input.deposit) { err.textContent = "It looks like your full deposit has been returned, so there is nothing left to demand."; return; }

    const a = assess(input);
    renderVerdict(input, a);
    renderTimeline(input, a);
    $("letter").textContent = buildLetter(input, a);
    renderSteps(a);
    $("results").classList.remove("hidden");
    $("verdict").focus({ preventScroll: true });
    $("verdict").scrollIntoView({ behavior: "smooth", block: "start" });
    track("deposit_completed", a.kind);
  }

  document.addEventListener("DOMContentLoaded", function () {
    $("moveOut").max = new Date().toISOString().slice(0, 10);
    $("deposit-form").addEventListener("submit", run);
    $("demo-btn").addEventListener("click", function () {
      const d = addDays(today(), -37);
      $("moveOut").value = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      $("unitType").value = "market"; $("statement").value = "none";
      $("deposit").value = "3200"; $("returned").value = "0"; $("rent").value = "3200";
      $("tenantName").value = "Jordan Rivera"; $("landlordName").value = "Example Management LLC";
      $("tenantAddr").value = "123 Example Street, Apt 4B, Brooklyn, NY 11206";
      $("landlordAddr").value = "500 Sample Avenue, Suite 200, New York, NY 10001";
      $("rentalAddr").value = "88 Placeholder Place, Apt 2R, Brooklyn, NY 11237";
      track("deposit_demo");
      run();
    });
    $("copy-btn").addEventListener("click", function () { copyText($("letter").innerText, this); track("letter_copy"); });
    $("download-btn").addEventListener("click", function () { downloadText("deposit-demand-letter.txt", $("letter").innerText); track("letter_download"); });
    $("print-btn").addEventListener("click", function () { track("letter_print"); window.print(); });
  });
})();
