// ==UserScript==
// @name         LSSD Court Master Index Generator
// @namespace    https://github.com/zoephix/CSB-Master-Index-Generator
// @version      1.0.0
// @description  Instantly generate a BBCode master index table of all court threads (with status, filtering, and copy-to-clipboard) for the LSSD Court Process Tracking forums.
// @author       zoephix
// @match        https://lssd.gta.world/viewtopic.php?t=68646*
// @match        https://lssd.gta.world/viewtopic.php?p=322620*
// @match        https://lssd.gta.world/posting.php?mode=edit&p=322620*
// @icon         https://lssd.gta.world/favicon.ico
// @license      MIT
// @grant        none
// @homepageURL  https://github.com/zoephix/CSB-Master-Index-Generator
// @supportURL   https://github.com/zoephix/CSB-Master-Index-Generator/issues
// ==/UserScript==

(function () {
  "use strict";

  // Create generate button
  const btn = document.createElement("button");
  btn.textContent = "Generate & Copy Court Index";
  btn.style.position = "fixed";
  btn.style.top = "10px";
  btn.style.right = "10px";
  btn.style.zIndex = 9999;
  btn.style.padding = "8px 12px";
  btn.style.backgroundColor = "#4CAF50";
  btn.style.color = "white";
  btn.style.border = "none";
  btn.style.borderRadius = "4px";
  btn.style.cursor = "pointer";
  document.body.appendChild(btn);

  async function handleGenerateAndEdit(autoRun) {
    // Store objects with all info for sorting
    const threadEntries = [];


    // Fetch status colors from the reference topic
    async function getStatusColors() {
      // Since the script is only visible on this page, we can directly parse the DOM for status colors
      const fallback = {
        OUTSTANDING: "red",
        "PENDING LEGAL": "chocolate",
        "WARRANT FILED": "darkblue",
        ARREST: "crimson",
        "ON-GOING": "blue",
        "FOLLOW-UP": "teal",
        SEIZED: "saddlebrown",
        "TO AUCTION": "gold",
        "IN AUCTION": "orange",
        SERVED: "green",
        "UNABLE TO SERVE": "purple",
        CLOSED: "gray",
      };
      try {
        // Try to find the status tags in the current page DOM
        const container = Array.from(document.querySelectorAll('div')).find(div => /Status tags:/i.test(div.innerHTML));
        if (!container) return fallback;
        const match = container.innerHTML.match(/Status tags:(.*?)<\/div>/is);
        if (!match) return fallback;
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = match[1];
        const spans = tempDiv.querySelectorAll("span[style*='color']");
        const map = {};
        spans.forEach(span => {
          const color = span.style.color;
          const status = span.textContent.trim().toUpperCase();
          map[status] = color;
        });
        return Object.keys(map).length ? map : fallback;
      } catch (e) {
        return fallback;
      }
    }

    const docketPattern =
      /^([A-Z]{2,}-\d{5}(?:\/[A-Z]{2,}-\d{5})*|\d{2}[A-Z]{4}\d{5})$/i;

    async function fetchPage(url) {
      const response = await fetch(url);
      const text = await response.text();
      const parser = new DOMParser();
      return parser.parseFromString(text, "text/html");
    }


    async function parsePage(doc, statusColors) {
      const threads = doc.querySelectorAll("li.row");
      threads.forEach((thread) => {
        const titleLink = thread.querySelector(".topictitle");
        if (!titleLink) return;
        const threadTitle = titleLink.textContent.trim();
        const threadURL = new URL(
          titleLink.getAttribute("href"),
          window.location.origin
        ).href;
        // Extract all bracketed groups
        const allBrackets = [...threadTitle.matchAll(/\[([^\]]+)\]/g)].map(
          (m) => m[1].trim()
        );
        // Default docket
        let docket = "N/A";
        let statuses = [];
        if (allBrackets.length > 0 && docketPattern.test(allBrackets[0])) {
          docket = allBrackets[0];
          statuses = allBrackets.slice(1);
        } else {
          statuses = allBrackets;
        }
        // Extract type and subject
        let remainder = threadTitle.replace(/\[[^\]]+\]/g, "").trim();
        let type = "N/A";
        let subject = "N/A";
        if (remainder.includes("-")) {
          const parts = remainder.split("-");
          type = parts.slice(0, -1).join("-").trim();
          subject = parts.slice(-1)[0].trim();
        } else if (remainder.length > 0) {
          type = remainder;
        }
        type = type.replace(/^[-\s]+/, "");
        // Normalize all variants
        if (/^financial( services?)? warrant$/i.test(type)) {
          type = "FSW";
        }
        // Skip invalid threads
        if (docket === "N/A" && subject === "N/A" && statuses.length === 0)
          return;
        // Colored statuses
        const coloredStatuses = statuses
          .map((s) => {
            const color = statusColors[s.toUpperCase()] || "red";
            return `[color=${color}][b]${s}[/b][/color]`;
          })
          .join(", ");
        // Get topic posted time for sorting
        const topicPostTime = thread.querySelector(".topic-poster time");
        const topicPostedISO = topicPostTime ? topicPostTime.getAttribute("datetime") : null;
        const topicPosted = topicPostTime
          ? new Date(topicPostedISO).toLocaleDateString(
              "en-GB",
              { day: "2-digit", month: "short", year: "numeric" }
            )
          : "N/A";
        const deputy = thread.querySelector(
          ".topic-poster a.username-coloured"
        );
        const deputyName = deputy ? deputy.textContent.trim() : "N/A";
        threadEntries.push({
          docket,
          subject,
          type,
          coloredStatuses,
          lastUpdated: topicPosted, // for display (still used for 'Last Updated' col)
          lastUpdatedISO: topicPostedISO, // for sorting
          dateCreated: topicPosted, // for new column
          deputyName,
          threadURL
        });
      });
    }

    // Get all forum page URLs from pagination
    function getAllForumPageUrls(doc, baseUrl) {
      const urls = new Set();
      urls.add(baseUrl);
      const pagination = doc.querySelector('.pagination');
      if (pagination) {
        const links = pagination.querySelectorAll('a');
        links.forEach(link => {
          const href = link.getAttribute('href');
          if (href && href.includes('viewforum.php?f=1026')) {
            urls.add(new URL(href, window.location.origin).href);
          }
        });
      }
      return Array.from(urls);
    }

    // Always start from the first page if pagination exists
    function getFirstPageUrl(doc) {
      const pagination = doc.querySelector('.pagination ul');
      if (pagination) {
        const firstPageLink = pagination.querySelector('a.button');
        if (firstPageLink) {
          return new URL(firstPageLink.getAttribute('href'), window.location.origin).href;
        }
      }
      return null;
    }

    // Fetch status colors first
    const statusColors = await getStatusColors();

    // Fetch from the forum listing page
    const forumUrl = "https://lssd.gta.world/viewforum.php?f=1026";
    const initialDoc = await fetchPage(forumUrl);
    const allPageUrls = getAllForumPageUrls(initialDoc, forumUrl);
    for (const pageUrl of allPageUrls) {
      const doc = pageUrl === forumUrl ? initialDoc : await fetchPage(pageUrl);
      await parsePage(doc, statusColors);
    }

    // Sort by topicPostedISO descending (most recent first)
    threadEntries.sort((a, b) => {
      if (!a.lastUpdatedISO && !b.lastUpdatedISO) return 0;
      if (!a.lastUpdatedISO) return 1;
      if (!b.lastUpdatedISO) return -1;
      return new Date(b.lastUpdatedISO) - new Date(a.lastUpdatedISO);
    });

    const tableHeader =
      "[table=left,0,0,auto]\n[tr][td][b]Docket No.[/b][/td][td][b]Subject[/b][/td][td][b]Type(s)[/b][/td][td][b]Current Status[/b][/td][td][b]Date Created[/b][/td][td][b]Last Updated[/b][/td][td][b]Assigned Deputy[/b][/td][/tr]";
    const tableFooter = "[/table]";
    const bbcodeEntries = threadEntries.map(entry =>
      `[tr][td][url=${entry.threadURL}]${entry.docket}[/url][/td][td]${entry.subject}[/td][td]${entry.type}[/td][td]${entry.coloredStatuses}[/td][td]${entry.dateCreated}[/td][td]${entry.lastUpdated}[/td][td]${entry.deputyName}[/td][/tr]`
    );
    const fullBBCode = [tableHeader, ...bbcodeEntries, tableFooter].join("\n");

    // If on edit page, replace table in textarea and submit
    if (window.location.pathname.endsWith('/posting.php') && /mode=edit/.test(window.location.search)) {
      const textarea = document.querySelector('textarea[name="message"]');
      if (textarea) {
        // Replace the first [table=...]...[/table] block
        textarea.value = textarea.value.replace(/\[table=left,0,0,auto][\s\S]*?\[\/table]/, fullBBCode);
        // Optionally scroll to textarea for user feedback
        textarea.scrollIntoView({behavior: 'smooth', block: 'center'});
        // Press the preview button automatically
        const form = document.getElementById('postform');
        if (form) {
          setTimeout(() => {
            const previewBtn = form.querySelector('input[type="submit"][name="preview"]');
            if (previewBtn) {
              previewBtn.click();
              setTimeout(() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                alert('Master index generated! Please check the preview and submit if everything looks correct.');
              }, 500);
            } else {
              alert('Could not find the Preview button.');
            }
          }, 300);
        }
      } else {
        alert('Could not find the post textarea.');
      }
      // Clean up the flag if present
      if (autoRun) sessionStorage.removeItem('csb_auto_edit');
      return;
    } else {
      // Not on edit page: redirect automatically
      let editUrl = null;
      const editLink = document.querySelector('a[href*="posting.php?mode=edit"]');
      if (editLink) {
        editUrl = editLink.href;
      } else {
        editUrl = 'https://lssd.gta.world/posting.php?mode=edit&p=322620';
      }
      // Set flag so script knows to auto-run after redirect
      sessionStorage.setItem('csb_auto_edit', '1');
      window.location.href = editUrl;
      return;
    }
  }

  btn.addEventListener("click", () => handleGenerateAndEdit(false));

  // Auto-run if redirected for edit
  if (sessionStorage.getItem('csb_auto_edit') === '1') {
    handleGenerateAndEdit(true);
  }
})();
