// ==UserScript==
// @name         LSSD Court Master Index Generator (Click to Copy)
// @namespace    https://github.com/zoephix/CSB-Master-Index-Generator
// @version      5.1
// @description  Instantly generate a BBCode master index table of all court threads (with status, filtering, and copy-to-clipboard) for the LSSD Court Process Tracking forums.
// @author       zoephix
// @match        https://lssd.gta.world/viewforum.php?f=1026
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

  btn.addEventListener("click", async () => {
  // Store objects with all info for sorting
  const threadEntries = [];

    const statusColors = {
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

    const docketPattern =
      /^([A-Z]{2,}-\d{5}(?:\/[A-Z]{2,}-\d{5})*|\d{2}[A-Z]{4}\d{5})$/i;

    async function fetchPage(url) {
      const response = await fetch(url);
      const text = await response.text();
      const parser = new DOMParser();
      return parser.parseFromString(text, "text/html");
    }

    async function parsePage(url) {
      const doc = await fetchPage(url);
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
          type = "Financial Services Warrant";
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

      const nextLink = doc.querySelector('.pagination a[rel="next"]');
      if (nextLink) {
        const nextURL = new URL(
          nextLink.getAttribute("href"),
          window.location.origin
        ).href;
        await parsePage(nextURL);
      }
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

    // Fetch the current page to check for pagination
    const initialDoc = await fetchPage(window.location.href);
    const firstPageUrl = getFirstPageUrl(initialDoc);
    if (firstPageUrl && firstPageUrl !== window.location.href) {
      await parsePage(firstPageUrl);
    } else {
      await parsePage(window.location.href);
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

    // Copy to clipboard
    navigator.clipboard
      .writeText(fullBBCode)
      .then(() => {
        alert(
          `Finished! ${bbcodeEntries.length} threads added and copied to clipboard.`
        );
      })
      .catch((err) => {
        console.error("Failed to copy:", err);
        alert("Error copying BBCode to clipboard.");
      });
  });
})();
