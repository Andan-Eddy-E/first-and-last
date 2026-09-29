/* Lease Decoder: rule-based checks that run in the browser.
   Each rule names the statute it relies on. Rules are deliberately conservative:
   a "likely unlawful" result needs a number over a legal cap or explicit waiver
   language; everything fuzzier is labeled "ask about this". */

(function () {
  const $ = function (id) { return document.getElementById(id); };
  const LAW = "https://www.nysenate.gov/legislation/laws/";
  const AG_GUIDE = "https://ag.ny.gov/publications/residential-tenants-rights-guide";

  function money(str) { return parseFloat(String(str).replace(/,/g, "")); }
  function firstMatch(text, regex) {
    regex.lastIndex = 0;
    const m = regex.exec(text);
    return m ? { index: m.index, length: m[0].length, groups: m } : null;
  }
  function allMatches(text, regex) {
    const out = []; let m; regex.lastIndex = 0;
    while ((m = regex.exec(text)) !== null) { out.push({ index: m.index, length: m[0].length, groups: m }); if (m[0].length === 0) regex.lastIndex++; }
    return out;
  }
  function windowAround(text, hit, before, after) {
    return text.slice(Math.max(0, hit.index - before), Math.min(text.length, hit.index + hit.length + after));
  }

  /* ---------- The rules ---------- */
  const RULES = [
    {
      id: "late_fee", title: "Late fee above the legal cap",
      test: function (t) {
        const hits = allMatches(t, /late\s+(fee|charge|payment)s?|fee\s+for\s+late/gi);
        for (const h of hits) {
          const w = windowAround(t, h, 40, 240);
          const amounts = allMatches(w, /\$\s?([\d,]+(?:\.\d{1,2})?)/g).map(function (a) { return money(a.groups[1]); });
          const percents = allMatches(w, /(\d+(?:\.\d+)?)\s?(?:%|percent)/gi).map(function (p) { return parseFloat(p.groups[1]); });
          const overAmount = amounts.find(function (a) { return a > 50 && a <= 500; });
          const overPercent = percents.find(function (p) { return p > 5 && p <= 50; });
          const perDay = /per\s+day|each\s+day|daily/i.test(w);
          if (overAmount || overPercent) return { hit: h, severity: "bad", detail: overAmount ? "This lease names a late charge of $" + overAmount + "." : "This lease names a late charge of " + overPercent + "%." };
          if (perDay) return { hit: h, severity: "warn", detail: "This lease appears to charge a late fee that grows each day, which can quickly pass the cap." };
        }
        return null;
      },
      explain: "New York caps late fees at $50 or 5% of the monthly rent, whichever is less, and rent is not legally late until it is more than five days overdue. A lease cannot waive this limit.",
      cite: { label: "Real Property Law § 238-a(2)", url: LAW + "RPP/238-A" }
    },
    {
      id: "deposit_cap", title: "Security deposit above one month's rent",
      test: function (t) {
        const rent = firstMatch(t, /(?:monthly\s+rent|rent\s+per\s+month|per\s+month\s+rent)[^$]{0,60}\$\s?([\d,]+(?:\.\d{2})?)/i) || firstMatch(t, /\$\s?([\d,]+(?:\.\d{2})?)\s+per\s+month/i);
        const dep = firstMatch(t, /security(?:\s+deposit)?[^$.]{0,80}\$\s?([\d,]+(?:\.\d{2})?)/i);
        if (rent && dep && money(dep.groups[1]) > money(rent.groups[1]) + 0.5) {
          return { hit: dep, severity: "bad", detail: "The deposit ($" + dep.groups[1] + ") is larger than one month's rent ($" + rent.groups[1] + ")." };
        }
        const multi = firstMatch(t, /(?:security|deposit)[^.]{0,100}\b(two|three|2|3)\s*(?:\(\d\)\s*)?months?['’]?\s+rent|\b(two|three|2|3)\s*(?:\(\d\)\s*)?months?['’]?\s+(?:rent\s+as\s+)?security/i);
        if (multi) return { hit: multi, severity: "bad", detail: "This lease asks for more than one month's rent as security." };
        const last = firstMatch(t, /last\s+month['’]?s?\s+rent/i);
        if (last && /security/i.test(t)) return { hit: last, severity: "warn", detail: "This lease mentions last month's rent in addition to a security deposit. Together they cannot exceed one month's rent." };
        return null;
      },
      explain: "Landlords cannot collect more than one month's rent as a deposit or advance. That limit covers the security deposit, last month's rent, and any pet deposit added together.",
      cite: { label: "General Obligations Law § 7-108(1-a)(a)", url: LAW + "GOB/7-108" }
    },
    {
      id: "application_fee", title: "Application or processing fee over $20",
      test: function (t) {
        const hits = allMatches(t, /(application|processing|administrative|admin|credit\s+check|background\s+check)\s+(fee|charge)[^$.]{0,80}\$\s?([\d,]+(?:\.\d{2})?)/gi);
        for (const h of hits) if (money(h.groups[3]) > 20) return { hit: h, severity: "bad", detail: "This lease names a $" + h.groups[3] + " " + h.groups[1].toLowerCase() + " fee." };
        return null;
      },
      explain: "Application fees are prohibited. The only charge allowed before a tenancy is the actual cost of a background and credit check, up to $20, and it must be waived if you supply your own report from the last 30 days.",
      cite: { label: "Real Property Law § 238-a(1)", url: LAW + "RPP/238-A" }
    },
    {
      id: "non_refundable", title: "Non-refundable deposit or fee",
      test: function (t) {
        const h = firstMatch(t, /non-?\s?refundable[^.]{0,80}(deposit|fee|charge)|(deposit|fee)[^.]{0,60}non-?\s?refundable/i);
        if (!h) return null;
        const isDeposit = /deposit/i.test(windowAround(t, h, 0, 0));
        return { hit: h, severity: isDeposit ? "bad" : "warn", detail: isDeposit ? "A deposit cannot be non-refundable." : "Ask what this fee is for and whether the law allows it." };
      },
      explain: "The entire deposit is refundable when you move out, less only itemized, lawful deductions: unpaid rent, unpaid utilities owed to the landlord, damage beyond normal wear and tear, and moving or storage of your belongings.",
      cite: { label: "General Obligations Law § 7-108(1-a)(b)", url: LAW + "GOB/7-108" }
    },
    {
      id: "mitigate", title: "Landlord disclaims the duty to re-rent",
      test: function (t) {
        const h = firstMatch(t, /(no|not\s+have\s+any|without\s+any|under\s+no)\s+(duty|obligation)\s+to\s+(mitigate|re-?\s?let|re-?\s?rent)/i);
        return h ? { hit: h, severity: "bad" } : null;
      },
      explain: "If you leave before the lease ends, the landlord must make reasonable efforts to re-rent the apartment at fair market value, and your liability stops when a new tenant's lease begins. Any clause saying otherwise is void.",
      cite: { label: "Real Property Law § 227-e", url: LAW + "RPP/227-E" }
    },
    {
      id: "habitability", title: "Waiver of the warranty of habitability",
      test: function (t) {
        const h = firstMatch(t, /waive[sd]?[^.]{0,120}habitab|habitab[^.]{0,120}waive/i);
        return h ? { hit: h, severity: "bad" } : null;
      },
      explain: "Every residential lease in New York carries a promise that the apartment is fit to live in and free of conditions dangerous to life, health, or safety. You cannot sign that right away, even if you want to.",
      cite: { label: "Real Property Law § 235-b", url: LAW + "RPP/235-B" }
    },
    {
      id: "negligence", title: "Landlord not liable for its own negligence",
      test: function (t) {
        const hits = allMatches(t, /(landlord|owner|lessor)\s+(shall|will|is)\s+not\s+(be\s+)?(liable|responsible)/gi);
        for (const h of hits) {
          const w = windowAround(t, h, 0, 260);
          if (/(unless|except)[^.]{0,80}negligen/i.test(w)) continue;
          if (/negligen/i.test(w)) return { hit: h, severity: "bad" };
          if (/any\s+(and\s+all\s+)?(injur|damage|loss)/i.test(w)) return { hit: h, severity: "warn", detail: "This is a broad liability waiver. It cannot shield the landlord from its own negligence." };
        }
        return null;
      },
      explain: "A lease clause that excuses the landlord from liability for injuries or property damage caused by the landlord's own negligence is void and unenforceable.",
      cite: { label: "General Obligations Law § 5-321", url: LAW + "GOB/5-321" }
    },
    {
      id: "jury", title: "Jury trial waiver",
      test: function (t) {
        const h = firstMatch(t, /waive[sd]?[^.]{0,120}(trial\s+by\s+jury|jury\s+trial)|(trial\s+by\s+jury|jury\s+trial)[^.]{0,80}waive/i);
        return h ? { hit: h, severity: "warn" } : null;
      },
      explain: "Jury waivers are common in NYC leases, but a waiver is null and void in any action for personal injury or property damage. It may still apply to other disputes, such as nonpayment cases.",
      cite: { label: "Real Property Law § 259-c", url: LAW + "RPP/259-C" }
    },
    {
      id: "occupancy", title: "Restriction on who can live with you",
      test: function (t) {
        const h = firstMatch(t, /occupied\s+(only|solely|exclusively)\s+by|no\s+(other\s+)?(person|occupant|individual)s?[^.]{0,60}(reside|occupy|live)|only\s+(the\s+)?(tenant|persons?)\s+(named|listed)[^.]{0,60}(reside|occupy|live)/i);
        return h ? { hit: h, severity: "warn" } : null;
      },
      explain: "Under the Roommate Law, a tenant may share the apartment with immediate family, one additional occupant, and that occupant's dependent children. Lease language that restricts this is unenforceable.",
      cite: { label: "Real Property Law § 235-f", url: LAW + "RPP/235-F" }
    },
    {
      id: "move_fees", title: "Cleaning, move-in, or similar flat fees",
      test: function (t) {
        const h = firstMatch(t, /(cleaning|move-?\s?in|move-?\s?out|redecorating|repainting|painting)\s+(fee|charge|deposit)/i);
        return h ? { hit: h, severity: "warn" } : null;
      },
      explain: "Deductions must reflect actual, itemized costs for damage beyond normal wear and tear. A flat cleaning or painting fee charged to every tenant does not fit that rule, and any extra deposit counts toward the one-month cap.",
      cite: { label: "General Obligations Law § 7-108(1-a)", url: LAW + "GOB/7-108" }
    },
    {
      id: "pet_deposit", title: "Separate pet deposit",
      test: function (t) {
        const h = firstMatch(t, /pet\s+(security\s+)?(deposit|security)/i);
        return h ? { hit: h, severity: "warn" } : null;
      },
      explain: "A pet deposit is allowed only if the pet deposit and security deposit together do not exceed one month's rent.",
      cite: { label: "General Obligations Law § 7-108(1-a)(a)", url: LAW + "GOB/7-108" }
    },
    {
      id: "bounced_check", title: "Returned check fee above $20",
      test: function (t) {
        const hits = allMatches(t, /(returned|dishonored|bounced|insufficient\s+funds)[^$.]{0,100}\$\s?([\d,]+(?:\.\d{2})?)/gi);
        for (const h of hits) if (money(h.groups[2]) > 20 && money(h.groups[2]) <= 500) return { hit: h, severity: "warn", detail: "This lease names a $" + h.groups[2] + " returned check charge." };
        return null;
      },
      explain: "A landlord may pass along a returned check charge only if the lease allows it, and only up to the actual bank cost or the statutory amount, which is $20.",
      cite: { label: "Real Property Law § 238-a(2-a) and General Obligations Law § 5-328", url: LAW + "RPP/238-A" }
    },
    {
      id: "entry", title: "Landlord entry at any time or without notice",
      test: function (t) {
        const h = firstMatch(t, /enter[^.]{0,120}(at\s+any\s+time|without\s+(prior\s+)?notice)/i);
        return h ? { hit: h, severity: "warn" } : null;
      },
      explain: "Outside of emergencies, a landlord may enter only at a reasonable time and after reasonable prior notice, for repairs, agreed services, or showings permitted by the lease.",
      cite: { label: "NY Attorney General, Residential Tenants' Rights Guide", url: AG_GUIDE }
    },
    {
      id: "broker", title: "Broker fee charged to the tenant",
      test: function (t) {
        const hits = allMatches(t, /broker(age)?['’]?s?\s+(fee|commission)/gi);
        for (const h of hits) if (/tenant/i.test(windowAround(t, h, 120, 160))) return { hit: h, severity: "warn" };
        return null;
      },
      explain: "In New York City, a broker who represents the landlord cannot charge the tenant a fee. You pay a broker only if you hired that broker yourself. All fees you owe must be disclosed in writing before you sign.",
      cite: { label: "NYC FARE Act (Department of Consumer and Worker Protection)", url: "https://www.nyc.gov/site/dca/about/FAQ-Broker-Fees.page" }
    },
    {
      id: "auto_renew", title: "Automatic renewal clause",
      test: function (t) {
        const h = firstMatch(t, /automatic(ally)?\s+renew|renew(s|ed)?\s+automatically|shall\s+renew\s+for\s+(successive|additional)/i);
        return h ? { hit: h, severity: "info" } : null;
      },
      explain: "An automatic renewal clause only binds you if the landlord reminds you of it in writing, by personal delivery or certified mail, 15 to 30 days before your deadline to give notice. No reminder, no automatic renewal.",
      cite: { label: "General Obligations Law § 5-905", url: LAW + "GOB/5-905" }
    },
    {
      id: "attorney_fees", title: "Attorney's fees clause",
      test: function (t) {
        const h = firstMatch(t, /(attorney|legal)['’]?s?['’]?\s+fees/i);
        return h ? { hit: h, severity: "info" } : null;
      },
      explain: "If your lease lets the landlord recover attorney's fees from you, the law automatically gives you the same right against the landlord when you win. This works in your favor and cannot be waived.",
      cite: { label: "Real Property Law § 234", url: LAW + "RPP/234" }
    },
    {
      id: "as_is", title: "\"As is\" condition language",
      test: function (t) {
        const h = firstMatch(t, /\bas[-\s]is\b/i);
        return h ? { hit: h, severity: "info" } : null;
      },
      explain: "Accepting an apartment \"as is\" does not cancel the warranty of habitability. It does make your move-in photos important. Photograph every room before you unpack, and ask for the move-in inspection the law entitles you to.",
      cite: { label: "Real Property Law § 235-b and General Obligations Law § 7-108(1-a)(c)", url: LAW + "RPP/235-B" }
    }
  ];

  /* ---------- Required riders and notices ---------- */
  const RIDERS = [
    { name: "Good Cause Eviction notice", pattern: /good\s+cause/i, why: "Leases must state whether the unit is covered by the Good Cause Eviction Law, which limits rent increases and non-renewals in covered units.", cite: { label: "RPL § 231-c", url: LAW + "RPP/231-C" } },
    { name: "Sprinkler system disclosure", pattern: /sprinkler/i, why: "Every residential lease must say, in bold type, whether the unit has a working sprinkler system.", cite: { label: "RPL § 231-a", url: LAW + "RPP/231-A" } },
    { name: "Flood history and risk disclosure", pattern: /flood/i, why: "Residential leases must disclose the unit's flood zone status and known flood damage history.", cite: { label: "RPL § 231-b", url: LAW + "RPP/231-B" } },
    { name: "Bedbug infestation history", pattern: /bed\s?-?bug/i, why: "NYC landlords must give new tenants a one-year bedbug history for the unit and building.", cite: { label: "NYC HPD: Bedbugs", url: "https://www.nyc.gov/site/hpd/services-and-information/bedbugs.page" } },
    { name: "Window guard notice", pattern: /window\s+guard/i, why: "NYC leases must include a notice asking whether a child age 10 or under lives in the unit, which triggers the landlord's duty to install window guards.", cite: { label: "NYC HPD: Window Guards", url: "https://www.nyc.gov/site/hpd/services-and-information/window-guards.page" } },
    { name: "Lead paint disclosure", pattern: /lead[\s-]+(based\s+)?paint|lead\s+hazard/i, why: "For buildings built before 1978, federal law requires a lead paint disclosure, and NYC's Local Law 1 adds its own notice about children under 6.", cite: { label: "NYC HPD: Lead-Based Paint", url: "https://www.nyc.gov/site/hpd/services-and-information/lead-based-paint.page" } }
  ];

  /* ---------- Rendering ---------- */
  const LABEL = { bad: "Likely unlawful", warn: "Ask about this", info: "Good to know" };
  const ORDER = { bad: 0, warn: 1, info: 2 };

  function excerpt(text, hit) {
    const start = Math.max(0, hit.index - 110), end = Math.min(text.length, hit.index + hit.length + 150);
    return (start > 0 ? "…" : "") + escapeHtml(text.slice(start, hit.index)) +
      "<mark>" + escapeHtml(text.slice(hit.index, hit.index + hit.length)) + "</mark>" +
      escapeHtml(text.slice(hit.index + hit.length, end)) + (end < text.length ? "…" : "");
  }

  function scan() {
    const err = $("lease-error");
    err.textContent = "";
    const raw = $("lease-text").value;
    const text = raw.replace(/\s+/g, " ").trim();
    if (text.split(" ").length < 60) { err.textContent = "That looks too short to be a lease. Paste the full text, or try the sample."; return; }

    const found = [];
    RULES.forEach(function (rule) {
      let res = null;
      try { res = rule.test(text); } catch (e) { res = null; }
      if (res) found.push({ rule: rule, res: res });
    });
    found.sort(function (a, b) { return ORDER[a.res.severity] - ORDER[b.res.severity]; });

    const counts = { bad: 0, warn: 0, info: 0 };
    found.forEach(function (f) { counts[f.res.severity]++; });
    $("summary-bar").innerHTML =
      "<span class='pill bad'>" + counts.bad + " likely unlawful</span>" +
      "<span class='pill warn'>" + counts.warn + " to ask about</span>" +
      "<span class='pill info'>" + counts.info + " good to know</span>" +
      "<span class='pill'>" + RULES.length + " checks run</span>";

    $("findings").innerHTML = found.length ? found.map(function (f) {
      return "<article class='card finding " + f.res.severity + "'>" +
        "<span class='pill " + f.res.severity + "'>" + LABEL[f.res.severity] + "</span>" +
        "<h3>" + escapeHtml(f.rule.title) + "</h3>" +
        (f.res.detail ? "<p><strong>" + escapeHtml(f.res.detail) + "</strong></p>" : "") +
        "<blockquote>" + excerpt(text, f.res.hit) + "</blockquote>" +
        "<p>" + escapeHtml(f.rule.explain) + "</p>" +
        "<p class='cite'>Source: <a href='" + f.rule.cite.url + "' target='_blank' rel='noopener'>" + escapeHtml(f.rule.cite.label) + "</a></p>" +
        "</article>";
    }).join("") : "<article class='card finding ok'><span class='pill'>Nothing flagged</span><h3>None of our " + RULES.length + " checks found a problem.</h3><p>That is a good sign, not a guarantee. The decoder looks for specific patterns and cannot judge everything a lease might contain.</p></article>";

    $("riders").innerHTML = RIDERS.map(function (r) {
      const present = r.pattern.test(text);
      return "<article class='card finding " + (present ? "ok" : "warn") + "'>" +
        "<span class='pill " + (present ? "" : "warn") + "'>" + (present ? "Found" : "Not found in your text") + "</span>" +
        "<h3>" + escapeHtml(r.name) + "</h3><p>" + escapeHtml(r.why) + "</p>" +
        "<p class='cite'>Source: <a href='" + r.cite.url + "' target='_blank' rel='noopener'>" + escapeHtml(r.cite.label) + "</a></p></article>";
    }).join("");

    $("lease-results").classList.remove("hidden");
    $("results-head").focus({ preventScroll: true });
    $("results-head").scrollIntoView({ behavior: "smooth", block: "start" });
    track("lease_scanned", counts.bad + "bad_" + counts.warn + "warn_" + counts.info + "info");
  }

  const SAMPLE = [
    "RESIDENTIAL LEASE AGREEMENT (fictional sample for demonstration)",
    "",
    "1. PREMISES AND TERM. Owner leases to Tenant Apartment 3L at 100 Sample Street, Brooklyn, New York, for a term of twelve months beginning October 1, 2026. The Apartment is accepted by Tenant in as-is condition.",
    "",
    "2. RENT. The monthly rent is $2,800.00, due on the first day of each month. If rent is not received by the 3rd day of the month, Tenant shall pay a late fee of $150.00 plus $10 per day until paid. Any returned check will incur a charge of $75.00.",
    "",
    "3. SECURITY. Tenant shall deposit with Owner security in the amount of $5,600.00. In addition, Tenant shall pay a pet deposit of $500.00 and a non-refundable move-in fee of $350.00. A cleaning fee of $400 will be deducted from the security deposit at the end of the term regardless of condition.",
    "",
    "4. APPLICATION. Tenant acknowledges payment of an application fee of $125.00, which shall not be returned.",
    "",
    "5. OCCUPANCY. The Apartment shall be occupied only by the Tenant named in this Lease. No other person may reside in the Apartment without Owner's written consent, which may be withheld for any reason.",
    "",
    "6. LIABILITY. Owner shall not be liable for any injury, loss, or damage to persons or property occurring in the Apartment or the Building, including injury or damage caused by the negligence of Owner or Owner's agents or employees.",
    "",
    "7. CONDITION. Tenant waives any claim under the warranty of habitability for conditions existing at the start of the term.",
    "",
    "8. ACCESS. Owner and Owner's agents may enter the Apartment at any time, without notice, for inspection, repairs, or to show the Apartment.",
    "",
    "9. EARLY TERMINATION. If Tenant vacates before the end of the term, Tenant shall remain liable for all rent through the end of the term, and Owner shall have no obligation to re-let the Apartment.",
    "",
    "10. LEGAL FEES AND JURY WAIVER. Tenant shall reimburse Owner for attorney's fees incurred in enforcing this Lease. Owner and Tenant each waive trial by jury in any action or proceeding between them.",
    "",
    "11. RENEWAL. This Lease shall automatically renew for successive one-year terms unless Tenant gives written notice at least 60 days before the end of the term.",
    "",
    "12. BROKER. Tenant agrees to pay the broker's fee of fifteen percent of the annual rent to Owner's listing agent at signing.",
    "",
    "13. RIDERS. Attached: Window Guard Notice; Lead Paint Disclosure."
  ].join("\n");

  document.addEventListener("DOMContentLoaded", function () {
    $("scan-btn").addEventListener("click", scan);
    $("sample-btn").addEventListener("click", function () { $("lease-text").value = SAMPLE; track("lease_sample"); scan(); });
  });
})();
