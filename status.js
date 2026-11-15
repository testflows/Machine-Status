/*
 * Copyright (C) 2026 Katteli Inc. All rights reserved.
 * TestFlows.com Open-Source Software Testing Framework (https://testflows.com)
 *
 * PROPRIETARY AND CONFIDENTIAL. This file contains trade secrets and
 * confidential information of Katteli Inc. Unauthorized copying, disclosure,
 * distribution, or use of this file, via any medium, is strictly prohibited
 * without express written authorization from Katteli Inc.
 *
 * Authors:
 *   Vitaliy Zakaznikov <vzakaznikov@testflows.com>
 */

// status.json is written by the outpost; notices.json by hand. Every text
// from them goes in as text, never as HTML.
"use strict";

const DAY = 86400;
const HISTORY_DAYS = 90;
const NARROW_DAYS = 30;
const NARROW = window.matchMedia("(max-width: 560px)");
const REFRESH_MS = 60 * 1000;
// Worst last: a day shows the worst level it had.
const ORDER = ["operational", "degraded", "down"];
const LABEL = {
  operational: "Operational",
  degraded: "Degraded",
  down: "Down",
  unknown: "Unknown",
};

async function load(file) {
  const resp = await fetch(file, { cache: "no-store" });
  if (!resp.ok) throw new Error(`${file}: ${resp.status}`);
  return resp.json();
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function utc(seconds) {
  return new Date(seconds * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

function ago(seconds) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}

function duration(seconds) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
}

// The worst level of a component in [start, end), and how long it was not
// operational there.
function span(incidents, start, end, now) {
  let level = "operational";
  let seconds = 0;
  for (const i of incidents) {
    const from = Math.max(i.from, start);
    const to = Math.min(i.to ?? now, end);
    if (to <= from || i.level === "unknown") continue;
    seconds += to - from;
    if (ORDER.indexOf(i.level) > ORDER.indexOf(level)) level = i.level;
  }
  return { level, seconds };
}

// The share of the measured window, up to HISTORY_DAYS, a component was not down.
function uptime(incidents, since, now) {
  const start = Math.max(since, now - HISTORY_DAYS * DAY);
  if (now - start < 3600) return null;
  const down = incidents
    .filter((i) => i.level === "down")
    .reduce((sum, i) => sum + Math.max(0, Math.min(i.to ?? now, now) - Math.max(i.from, start)), 0);
  return (100 * (1 - down / (now - start))).toFixed(2);
}

// Each day of the last `days` to today, by its worst level; a day before the
// record began, or after its last update `until`, has no data.
function bars(incidents, since, until, now, days) {
  const node = el("div", "bars");
  node.style.setProperty("--days", days);
  const today = Math.floor(now / DAY) * DAY;
  for (let d = days - 1; d >= 0; d--) {
    const start = today - d * DAY;
    const end = start + DAY;
    const date = new Date(start * 1000).toISOString().slice(0, 10);
    const cell = el("span");
    if (end <= since || start >= until) {
      cell.className = "none";
      cell.title = `${date}: no data`;
    } else {
      const { level, seconds } = span(incidents, start, end, until);
      cell.className = level;
      cell.title = level === "operational"
        ? `${date}: operational`
        : `${date}: ${LABEL[level].toLowerCase()}, not operational for ${duration(seconds)}`;
    }
    node.append(cell);
  }
  return node;
}

function verdict(levels) {
  if (levels.includes("down")) return ["down", "A component is down"];
  if (levels.includes("degraded")) return ["degraded", "A component is degraded"];
  if (levels.includes("unknown")) return ["unknown", "A component is not measured now"];
  return ["operational", "Every component is operational"];
}

function renderStatus(status, now) {
  const stale = now - status.updated > status.stale_after;
  const days = NARROW.matches ? NARROW_DAYS : HISTORY_DAYS;
  const components = status.components.map((c) => ({ ...c, level: stale ? "unknown" : c.level }));
  const [level, text] = stale
    ? ["unknown", "Status unknown"]
    : verdict(components.map((c) => c.level));
  document.getElementById("overall").className = `overall ${level}`;
  document.getElementById("verdict").textContent = text;
  document.getElementById("updated").textContent = stale
    ? `No update since ${utc(status.updated)}`
    : `Updated ${ago(now - status.updated)}, at ${utc(status.updated)}`;
  document.getElementById("range").textContent = `The last ${days} days`;
  const list = document.getElementById("components");
  list.replaceChildren(
    ...components.map((c) => {
      const mine = status.incidents.filter((i) => i.component === c.id);
      const item = el("li", c.level);
      const row = el("div", "row");
      // A class's name breaks at no hyphen: eu-central stays one word.
      const name = c.name.replaceAll("-", "\u2011");
      row.append(el("span", "name", name), el("span", "level", LABEL[c.level]));
      // What is known ends at the last update, however old it is.
      const up = uptime(mine, status.since, status.updated);
      const foot = el("div", "uptime muted");
      foot.append(
        el("span", "", `${days} days ago`),
        el("span", "", up === null ? "Measured since " + utc(status.since) : `${up}% not down`),
        el("span", "", "Today"),
      );
      item.append(row, bars(mine, status.since, status.updated, now, days), foot);
      return item;
    }),
  );
}

function renderUnavailable() {
  document.getElementById("overall").className = "overall unknown";
  document.getElementById("verdict").textContent = "Status unknown";
  document.getElementById("updated").textContent = "The status could not be read. It is retried every minute.";
}

// A notice shows from a day before it starts until it ends.
function renderNotices(notices, now) {
  const shown = notices.filter((n) => {
    const from = Date.parse(n.from) / 1000;
    const to = n.to ? Date.parse(n.to) / 1000 : Infinity;
    return now < to && now > from - DAY;
  });
  const box = document.getElementById("notices");
  box.hidden = shown.length === 0;
  box.replaceChildren(
    ...shown.map((n) => {
      const node = el("article", `notice ${n.level || "degraded"}`);
      const from = utc(Date.parse(n.from) / 1000);
      const when = n.to ? `${from} to ${utc(Date.parse(n.to) / 1000)}` : `Since ${from}`;
      node.append(el("h3", "", n.title), el("p", "", n.body), el("p", "when muted", when));
      return node;
    }),
  );
}

async function refresh() {
  const now = Date.now() / 1000;
  try {
    renderStatus(await load("status.json"), now);
  } catch (err) {
    renderUnavailable();
  }
  try {
    renderNotices(await load("notices.json"), now);
  } catch (err) {
    renderNotices([], now);
  }
}

refresh();
setInterval(refresh, REFRESH_MS);
NARROW.addEventListener("change", refresh);
