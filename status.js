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

// status.json is the outpost's measurement; incidents.json is written by an
// operator. Every text from them goes in as text, never as HTML.
"use strict";

const DAY = 86400;
const HISTORY_DAYS = 90;
const NARROW_DAYS = 30;
const PAST_DAYS = 14;
// A maintenance shows this long before it starts.
const MAINTENANCE_AHEAD = 7 * DAY;
const NARROW = window.matchMedia("(max-width: 560px)");
const REFRESH_MS = 60 * 1000;
// Worst last: a component, a day or the page shows the worst level it has.
const ORDER = ["operational", "maintenance", "degraded", "down"];
const LABEL = {
  operational: "Operational",
  maintenance: "Maintenance",
  degraded: "Degraded",
  down: "Down",
  unknown: "Unknown",
};
// The words of an incident's updates, as the operator writes them.
const UPDATE = {
  investigating: "Investigating",
  identified: "Identified",
  monitoring: "Monitoring",
  resolved: "Resolved",
  scheduled: "Scheduled",
  "in progress": "In progress",
  completed: "Completed",
  update: "Update",
};
const FINISHED = new Set(["resolved", "completed"]);
const SESSIONS = "sessions/";
const ABOUT = {
  website: "testflows.com, with the documentation and the installer, fetched from outside the cloud every 30 seconds.",
  api: "The API every command and the SDK use, asked from outside the cloud every 30 seconds.",
  "sign-in": "Sign-in codes mailed and accepted, checked every minute.",
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

// The viewer's time zone: UTC, their own, or any other, kept in their
// browser alone. Storage that throws, as in a private window, means UTC.
const ZONE_KEY = "zone";
const LOCAL = "local";
const LOCAL_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const ZONES = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];

function stored(key) {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    return null;
  }
}

function store(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    // Kept for this visit alone.
  }
}

let choice = stored(ZONE_KEY) || "UTC";
let zone = resolveZone(choice);

function resolveZone(value) {
  if (value === LOCAL) return LOCAL_ZONE;
  return value === "UTC" || ZONES.includes(value) ? value : "UTC";
}

function zoneName() {
  if (zone === "UTC") return "UTC";
  return new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" })
    .formatToParts(new Date()).find((p) => p.type === "timeZoneName").value;
}

function clock(seconds) {
  return new Date(seconds * 1000).toLocaleTimeString("en-GB", {
    timeZone: zone, hour: "2-digit", minute: "2-digit",
  });
}

function day(seconds) {
  return new Date(seconds * 1000).toLocaleDateString("en-US", {
    timeZone: zone, month: "short", day: "numeric", year: "numeric",
  });
}

function utc(seconds) {
  return `${day(seconds)}, ${clock(seconds)} ${zoneName()}`;
}

function ago(seconds) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function duration(seconds) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
}

function worst(levels) {
  return levels.reduce((a, b) => (ORDER.indexOf(b) > ORDER.indexOf(a) ? b : a), "operational");
}

// A class's name breaks at no hyphen: eu-central stays one word.
function unbroken(text) {
  return text.replaceAll("-", "‑");
}

function about(id) {
  if (id.startsWith(SESSIONS)) {
    return `A session created on ${id.slice(SESSIONS.length)}, a machine run in it and checkpointed, every 15 minutes.`;
  }
  return ABOUT[id] || "";
}

// --- The incidents an operator writes ---------------------------------------

function seconds(iso) {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t / 1000;
}

// Each written incident, its updates oldest first; a typo in one entry
// leaves it out, never the page.
function written(found) {
  if (!Array.isArray(found)) return [];
  return found
    .filter((i) => i && typeof i === "object" && Array.isArray(i.updates))
    .map((i) => ({
      id: String(i.id || ""),
      title: String(i.title || ""),
      kind: i.kind === "maintenance" ? "maintenance" : "incident",
      level: i.kind === "maintenance" ? "maintenance" : (i.level === "down" ? "down" : "degraded"),
      components: Array.isArray(i.components) ? i.components.map(String) : [],
      from: seconds(i.from),
      to: seconds(i.to),
      updates: i.updates
        .filter((u) => u && typeof u === "object" && seconds(u.at) !== null)
        .map((u) => ({ at: seconds(u.at), status: String(u.status || "update"), body: String(u.body || "") }))
        .sort((a, b) => a.at - b.at),
    }))
    .filter((i) => i.updates.length);
}

function finished(incident) {
  return FINISHED.has(incident.updates[incident.updates.length - 1].status);
}

// Shown at the top: an incident until resolved; a maintenance from
// MAINTENANCE_AHEAD before it starts until it is completed or ends.
function open(incident, now) {
  if (finished(incident)) return false;
  if (incident.kind !== "maintenance") return true;
  const ends = incident.to ?? Infinity;
  const starts = incident.from ?? -Infinity;
  return now < ends && now > starts - MAINTENANCE_AHEAD;
}

// Whether an open incident changes a level now: a maintenance only once it
// has started.
function underway(incident, now) {
  return incident.kind !== "maintenance" || (incident.from ?? Infinity) <= now;
}

// --- The measured history ---------------------------------------------------

// The worst level of a component in [start, end), and how long it was not
// operational there.
function span(stretches, start, end) {
  let level = "operational";
  let total = 0;
  for (const s of stretches) {
    const from = Math.max(s.from, start);
    const to = Math.min(s.to ?? end, end);
    if (to <= from || s.level === "unknown") continue;
    total += to - from;
    level = worst([level, s.level]);
  }
  return { level, seconds: total };
}

// The share of the measured window, up to HISTORY_DAYS, a component was not down.
function uptime(stretches, since, until) {
  const start = Math.max(since, until - HISTORY_DAYS * DAY);
  if (until - start < 3600) return null;
  const down = stretches
    .filter((s) => s.level === "down")
    .reduce((sum, s) => sum + Math.max(0, Math.min(s.to ?? until, until) - Math.max(s.from, start)), 0);
  return (100 * (1 - down / (until - start))).toFixed(2);
}

// Each day of the last `days` to today, by its worst level; a day before the
// record began, or after its last update `until`, has no data.
function bars(stretches, since, until, now, days) {
  const node = el("div", "bars");
  node.style.setProperty("--days", days);
  const today = Math.floor(now / DAY) * DAY;
  for (let d = days - 1; d >= 0; d--) {
    const start = today - d * DAY;
    const end = start + DAY;
    const cell = el("span");
    if (end <= since || start >= until) {
      cell.className = "none";
      cell.title = `${day(start)}: no data`;
    } else {
      const { level, seconds: total } = span(stretches, start, Math.min(end, until));
      cell.className = level;
      cell.title = level === "operational"
        ? `${day(start)}: operational`
        : `${day(start)}: ${LABEL[level].toLowerCase()}, not operational for ${duration(total)}`;
    }
    node.append(cell);
  }
  return node;
}

// A measured stretch a written incident of its component spans says less
// than the incident: the incident is shown alone.
function covered(stretch, incidents) {
  return incidents.some((i) => {
    if (!i.components.includes(stretch.component)) return false;
    const first = i.updates[0].at;
    const last = i.updates[i.updates.length - 1].at;
    return first <= (stretch.to ?? stretch.from) && stretch.from <= last;
  });
}

// A component's level now: what was measured, raised by a written incident
// or a maintenance under way. A declaration never lowers a measurement.
function level(component, live, stale) {
  if (stale) return "unknown";
  const declared = live.filter((i) => i.components.includes(component.id)).map((i) => i.level);
  if (component.level === "unknown") return declared.length ? worst(declared) : "unknown";
  return worst([component.level, ...declared]);
}

// --- Rendering --------------------------------------------------------------

function verdict(levels) {
  if (levels.includes("down")) return ["down", "A component is down"];
  if (levels.includes("degraded")) return ["degraded", "A component is degraded"];
  if (levels.includes("maintenance")) return ["maintenance", "Maintenance in progress"];
  if (levels.includes("unknown")) return ["unknown", "A component is not measured now"];
  return ["operational", "Every component is operational"];
}

function updatesList(incident) {
  const list = el("ol", "updates");
  for (const u of [...incident.updates].reverse()) {
    const item = el("li");
    item.append(
      el("strong", "", UPDATE[u.status] || u.status),
      el("span", "", ` ${u.body}`),
      el("div", "when muted", utc(u.at)),
    );
    list.append(item);
  }
  return list;
}

function affected(incident, names) {
  const named = incident.components.map((c) => unbroken(names[c] || c));
  return named.length ? `Affects ${named.join(", ")}` : "";
}

function scheduled(incident) {
  if (incident.kind !== "maintenance" || incident.from === null) return "";
  return `Scheduled ${utc(incident.from)}${incident.to ? ` to ${utc(incident.to)}` : ""}`;
}

function renderOpen(incidents, names, now) {
  const box = document.getElementById("open");
  const shown = incidents.filter((i) => open(i, now));
  box.hidden = shown.length === 0;
  box.replaceChildren(
    ...shown.map((i) => {
      const card = el("article", `incident ${i.level}`);
      card.id = i.id;
      const scope = [scheduled(i), affected(i, names)].filter(Boolean).join(". ");
      card.append(el("h3", "", i.title));
      if (scope) card.append(el("p", "muted", scope));
      card.append(updatesList(i));
      return card;
    }),
  );
}

function renderPast(incidents, stretches, names, now) {
  const box = document.getElementById("past-list");
  const start = Math.floor(now / DAY) * DAY - (PAST_DAYS - 1) * DAY;
  const items = [
    ...incidents
      .filter((i) => !open(i, now) && i.updates[0].at >= start)
      .map((i) => ({ at: i.updates[0].at, node: pastWritten(i, names) })),
    ...stretches
      .filter((s) => (s.level === "down" || s.level === "degraded") && (s.to ?? now) >= start && !covered(s, incidents))
      .map((s) => ({ at: s.from, node: pastMeasured(s, names) })),
  ].sort((a, b) => b.at - a.at);
  if (!items.length) {
    box.replaceChildren(el("p", "muted", `No incidents in the last ${PAST_DAYS} days.`));
    return;
  }
  const days = [];
  for (const item of items) {
    const label = day(item.at);
    if (!days.length || days[days.length - 1].label !== label) days.push({ label, nodes: [] });
    days[days.length - 1].nodes.push(item.node);
  }
  box.replaceChildren(
    ...days.map((d) => {
      const group = el("div", "past-day");
      group.append(el("h3", "", d.label), ...d.nodes);
      return group;
    }),
  );
}

// One row of the past: a title, its duration and components on one line,
// and its level; a written incident's updates fold under it.
function pastRow(id, level, title, meta, updates) {
  const node = el("article", `past ${level}`);
  if (id) node.id = id;
  const head = el("div", "row");
  const text = el("div");
  text.append(el("h4", "", title), el("p", "muted", meta));
  head.append(text, el("span", "chip", LABEL[level]));
  node.append(head);
  if (updates) {
    const fold = el("details");
    fold.append(el("summary", "muted", "Updates"), updates);
    node.append(fold);
  }
  return node;
}

function pastWritten(incident, names) {
  const first = incident.updates[0].at;
  const last = incident.updates[incident.updates.length - 1].at;
  const scope = incident.components.map((c) => unbroken(names[c] || c)).join(", ");
  const meta = [last > first ? duration(last - first) : "", scope].filter(Boolean).join(" · ");
  return pastRow(incident.id, incident.level, incident.title, meta, updatesList(incident));
}

function pastMeasured(stretch, names) {
  const name = unbroken(names[stretch.component] || stretch.component);
  const meta = stretch.to === null
    ? `Since ${clock(stretch.from)} · measured from outside the cloud`
    : `${duration(stretch.to - stretch.from)}, ${clock(stretch.from)} to ${clock(stretch.to)} · measured from outside the cloud`;
  return pastRow("", stretch.level, `${name} ${LABEL[stretch.level].toLowerCase()}`, meta, null);
}

// The rows of the components list: each component alone, but the classes'
// sessions as one group, its bar the worst of them each day.
function groups(components) {
  const sessions = components.filter((c) => c.id.startsWith(SESSIONS));
  const others = components.filter((c) => !c.id.startsWith(SESSIONS));
  const rows = others.map((c) => ({ id: c.id, name: c.name, level: c.level, about: about(c.id), ids: [c.id], parts: [] }));
  if (sessions.length) {
    rows.push({
      id: "sessions",
      name: "Sessions",
      level: sessions.map((c) => c.level).includes("unknown") && !sessions.some((c) => c.level !== "unknown")
        ? "unknown" : worst(sessions.map((c) => (c.level === "unknown" ? "operational" : c.level))),
      about: "On each class: a session created, a machine run in it and checkpointed, every 15 minutes.",
      ids: sessions.map((c) => c.id),
      parts: sessions.map((c) => ({ name: c.name.replace(/^Sessions on /, ""), level: c.level })),
    });
  }
  return rows;
}

function componentRow(row, status, until, now, days) {
  const mine = status.incidents.filter((s) => row.ids.includes(s.component));
  const item = el("li", row.level);
  const head = el("div", "row");
  head.append(el("span", "name", row.name), el("span", "level", LABEL[row.level]));
  // A group's share not down counts a stretch any of its parts was down.
  const up = uptime(mine, status.since, until);
  const foot = el("div", "uptime muted");
  foot.append(
    el("span", "", `${days} days ago`),
    el("span", "", up === null ? `Measured since ${utc(status.since)}` : `${up}% not down`),
    el("span", "", "Today"),
  );
  item.append(head, el("p", "about-line muted", row.about), bars(mine, status.since, until, now, days), foot);
  if (row.parts.length) {
    const parts = el("ul", "parts");
    for (const p of row.parts) {
      const part = el("li", p.level);
      part.append(el("span", "", unbroken(p.name)), el("span", "level", LABEL[p.level]));
      parts.append(part);
    }
    item.append(parts);
  }
  return item;
}

// When a level last changed: the newest edge of a stretch, or the start of
// the record when nothing has changed since.
function lastChange(status) {
  return status.incidents.reduce((t, s) => Math.max(t, s.from, s.to ?? 0), status.since);
}

function renderStatus(status, incidents, now) {
  const stale = now - status.updated > status.stale_after;
  const days = NARROW.matches ? NARROW_DAYS : HISTORY_DAYS;
  const names = Object.fromEntries(status.components.map((c) => [c.id, c.name]));
  const live = incidents.filter((i) => open(i, now) && underway(i, now));
  const components = status.components.map((c) => ({ ...c, level: level(c, live, stale) }));
  const [overall, text] = stale ? ["unknown", "Status unknown"] : verdict(components.map((c) => c.level));
  document.getElementById("overall").className = `overall ${overall}`;
  document.getElementById("verdict").textContent = text;
  // The outpost writes every change at once, so a fresh file holds until
  // now; a stale one only until it was written.
  const until = stale ? status.updated : now;
  const changed = lastChange(status);
  document.getElementById("updated").textContent = stale
    ? `No update since ${utc(status.updated)}`
    : `Measured continuously. Last change ${ago(now - changed)}, at ${utc(changed)}`;
  document.getElementById("range").textContent = `The last ${days} days`;
  document.getElementById("components").replaceChildren(
    ...groups(components).map((row) => componentRow(row, status, until, now, days)),
  );
  renderOpen(incidents, names, now);
  renderPast(incidents, status.incidents, names, now);
}

function renderUnavailable(incidents, now) {
  document.getElementById("overall").className = "overall unknown";
  document.getElementById("verdict").textContent = "Status unknown";
  document.getElementById("updated").textContent = "The status could not be read. It is read again every minute.";
  renderOpen(incidents, {}, now);
}

// A zone's offset from UTC now, in minutes, and as GMT+5:30 writes it.
function offset(name) {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: name, timeZoneName: "longOffset" })
    .formatToParts(new Date()).find((p) => p.type === "timeZoneName").value;
  const found = part.match(/GMT([+-])(\d{2}):(\d{2})/);
  const minutes = found ? (found[1] === "-" ? -1 : 1) * (Number(found[2]) * 60 + Number(found[3])) : 0;
  return { minutes, label: found ? part : "GMT" };
}

function city(name) {
  return name.split("/").pop().replaceAll("_", " ");
}

function renderZones() {
  const select = document.getElementById("zone");
  const option = (value, text) => {
    const node = el("option", "", text);
    node.value = value;
    return node;
  };
  const all = el("optgroup");
  all.label = "All time zones";
  all.append(
    ...ZONES.map((name) => ({ name, ...offset(name) }))
      .sort((a, b) => a.minutes - b.minutes || a.name.localeCompare(b.name))
      .map((z) => option(z.name, `${city(z.name)}, ${z.label}`)),
  );
  select.replaceChildren(option(LOCAL, `Local time, ${city(LOCAL_ZONE)}`), option("UTC", "UTC"), all);
  select.value = choice === LOCAL || choice === "UTC" || ZONES.includes(choice) ? choice : "UTC";
}

function switchZone(event) {
  choice = event.target.value;
  zone = resolveZone(choice);
  store(ZONE_KEY, choice);
  refresh();
}

// The theme: the system's until the viewer picks one. index.html sets a
// stored choice before the first paint.
const THEME_KEY = "theme";

function currentTheme() {
  const set = document.documentElement.dataset.theme;
  if (set) return set;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function renderTheme() {
  const button = document.getElementById("theme");
  const next = currentTheme() === "dark" ? "light" : "dark";
  button.title = `Switch to the ${next} theme`;
  button.setAttribute("aria-label", button.title);
  button.dataset.next = next;
}

function switchTheme() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  store(THEME_KEY, next);
  renderTheme();
}

async function refresh() {
  const now = Date.now() / 1000;
  let incidents = [];
  try {
    incidents = written(await load("incidents.json"));
  } catch (err) {
    incidents = [];
  }
  try {
    renderStatus(await load("status.json"), incidents, now);
  } catch (err) {
    renderUnavailable(incidents, now);
  }
}

document.getElementById("zone").addEventListener("change", switchZone);
document.getElementById("theme").addEventListener("click", switchTheme);
renderZones();
renderTheme();
refresh();
setInterval(refresh, REFRESH_MS);
NARROW.addEventListener("change", refresh);
