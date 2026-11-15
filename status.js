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

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;
const HISTORY_DAYS = 90;
const NARROW_DAYS = 30;
const PAST_DAYS = 14;
// A maintenance shows this long before it starts.
const MAINTENANCE_AHEAD = 7 * DAY;
// A day whose time was mostly not checked has no data, not a colour.
const UNCHECKED_SHARE = 0.5;
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
// How the banner says each level of the components at it.
const SAID = {
  down: "down",
  degraded: "degraded",
  maintenance: "under maintenance",
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
  website: "testflows.com, with the docs and the installer. Checked every 30 seconds.",
  api: "The API behind every machine command and the SDK. Checked every 30 seconds.",
  "sign-in": "Sends a sign-in code by email and signs in with it. Checked every minute.",
  sessions: "Every 15 minutes, creates a session on each class, starts a run and checkpoints it. An outage shows within 30 minutes.",
};
// A command a description names, on its own line after it.
const ABOUT_COMMAND = { sessions: ["Find your session's class with ", "machine sessions show"] };

// A query each time: GitHub Pages serves its files for 10 minutes from
// caches the browser's no-store does not reach.
async function load(file) {
  const resp = await fetch(`${file}?t=${Date.now()}`, { cache: "no-store" });
  if (!resp.ok) throw new Error(`${file}: ${resp.status}`);
  return resp.json();
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

// --- Time and the viewer's time zone ----------------------------------------

// Their own by default, UTC or any other, kept in their browser alone.
const ZONE_KEY = "zone";
const THEME_KEY = "theme";
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

let choice = stored(ZONE_KEY) || LOCAL;
let zone = resolveZone(choice);

function resolveZone(value) {
  if (value === LOCAL) return LOCAL_ZONE;
  return value === "UTC" || ZONES.includes(value) ? value : "UTC";
}

// A zone's offset from UTC at a moment, in minutes, and as GMT+5:30 writes it.
function offset(name, at) {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: name, timeZoneName: "longOffset" })
    .formatToParts(new Date(at * 1000)).find((p) => p.type === "timeZoneName").value;
  const found = part.match(/GMT([+-])(\d{2}):(\d{2})/);
  const minutes = found ? (found[1] === "-" ? -1 : 1) * (Number(found[2]) * 60 + Number(found[3])) : 0;
  return { minutes, label: found ? part : "GMT" };
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

function when(seconds) {
  return `${day(seconds)}, ${clock(seconds)} ${zoneName()}`;
}

// The start of the day that holds `seconds`, in the viewer's zone: the bars
// and the past list cut days where the dates they show change.
function dayStart(seconds) {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(seconds * 1000)).split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 1000 - offset(zone, seconds).minutes * MINUTE;
}

// The starts of the last `count` days, the oldest first, today last.
function dayStarts(now, count) {
  const starts = [dayStart(now)];
  while (starts.length < count) starts.unshift(dayStart(starts[0] - 1));
  return starts;
}

function ago(seconds) {
  const minutes = Math.round(seconds / MINUTE);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return `${Math.round(hours / 24)} days ago`;
}

// 45 minutes, 6 hours, 1 hour 5 minutes: as the Markdown and the feed say it.
function duration(seconds) {
  const minutes = Math.max(1, Math.round(seconds / MINUTE));
  const plural = (n, unit) => (n ? `${n} ${unit}${n === 1 ? "" : "s"}` : "");
  return [plural(Math.floor(minutes / 60), "hour"), plural(minutes % 60, "minute")].filter(Boolean).join(" ");
}

// A time an operator wrote: one without a zone is UTC, as the outpost reads it.
function seconds(text) {
  if (typeof text !== "string") return null;
  const zoned = /([zZ]|[+-]\d{2}:?\d{2})$/.test(text) || !text.includes("T") ? text : `${text}Z`;
  const t = Date.parse(zoned);
  return Number.isNaN(t) ? null : t / 1000;
}

function worst(levels) {
  return levels.reduce((a, b) => (ORDER.indexOf(b) > ORDER.indexOf(a) ? b : a), "operational");
}

// A class's name breaks at no hyphen: eu-central stays one word.
function unbroken(text) {
  return text.replaceAll("-", "‑");
}

// --- The incidents an operator writes ---------------------------------------

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

// The seconds of [start, end) the stretches of the given levels cover, each
// moment once: two classes down at once are one stretch down for Sessions.
function covered(stretches, levels, start, end) {
  const spans = stretches
    .filter((s) => levels.includes(s.level))
    .map((s) => [Math.max(s.from, start), Math.min(s.to ?? end, end)])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let total = 0;
  let reach = start;
  for (const [a, b] of spans) {
    if (b <= reach) continue;
    total += b - Math.max(a, reach);
    reach = b;
  }
  return total;
}

// A day's bar: its worst checked level, or no data when most of it was not
// checked; and how long it was not operational.
function dayLevel(stretches, start, end) {
  if (end <= start) return { level: "none", seconds: 0 };
  const bad = stretches.filter((s) => s.from < end && (s.to ?? end) > start && s.level !== "unknown");
  const level = worst(bad.map((s) => s.level));
  const down = covered(stretches, ["degraded", "down", "maintenance"], start, end);
  const unchecked = covered(stretches, ["unknown"], start, end);
  if (level === "operational" && unchecked > (end - start) * UNCHECKED_SHARE) {
    return { level: "none", seconds: 0 };
  }
  return { level, seconds: down };
}

// The share of checked time, up to HISTORY_DAYS, a component was
// operational: degraded and down both count against it. Time not checked
// counts neither way.
function uptime(stretches, since, until) {
  const start = Math.max(since, until - HISTORY_DAYS * DAY);
  const checked = until - start - covered(stretches, ["unknown"], start, until);
  if (checked < HOUR) return null;
  return 100 * (1 - covered(stretches, ["degraded", "down"], start, until) / checked);
}

function percent(share) {
  return share >= 100 ? "100%" : `${Math.min(share, 99.99).toFixed(2)}%`;
}

function bars(stretches, since, until, now, days) {
  const node = el("div", "bars");
  node.style.setProperty("--days", days);
  const starts = dayStarts(now, days);
  starts.forEach((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1] : start + DAY;
    const cell = el("span");
    const from = Math.max(start, since);
    const to = Math.min(end, until);
    const { level, seconds: total } = to > from ? dayLevel(stretches, from, to) : { level: "none", seconds: 0 };
    cell.className = level;
    cell.title = level === "none"
      ? `${day(start)}: no data`
      : level === "operational"
        ? `${day(start)}: operational`
        : `${day(start)}: ${LABEL[level].toLowerCase()}, not operational for ${duration(total)}`;
    node.append(cell);
  });
  return node;
}

// A measured stretch a written incident of its component spans says less
// than the incident: the incident is shown alone.
function coveredByWritten(stretch, incidents) {
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

// When a level last changed, or null when none has since the record began.
function lastChange(status) {
  const edges = status.incidents.flatMap((s) => [s.from, s.to ?? 0]);
  return edges.length ? Math.max(...edges) : null;
}

// --- Rendering --------------------------------------------------------------

// The banner: the worst level now, naming the components at it.
function verdict(components) {
  for (const at of ["down", "degraded", "maintenance"]) {
    const named = components.filter((c) => c.level === at).map((c) => unbroken(c.name));
    // "Sessions on standard-ip in EU" is plural.
    if (named.length === 1) return [at, `${named[0]} ${named[0].startsWith("Sessions") ? "are" : "is"} ${SAID[at]}`];
    if (named.length === 2) return [at, `${named[0]} and ${named[1]} are ${SAID[at]}`];
    if (named.length > 2) return [at, `${named.length} components are ${SAID[at]}`];
  }
  const unknown = components.filter((c) => c.level === "unknown").map((c) => unbroken(c.name));
  if (unknown.length) {
    return ["unknown", `Status unknown for ${unknown.length > 2 ? `${unknown.length} components` : unknown.join(" and ")}`];
  }
  return ["operational", "Every component is operational"];
}

function updatesList(incident) {
  const list = el("ol", "updates");
  for (const u of [...incident.updates].reverse()) {
    const item = el("li");
    item.append(
      el("strong", "", UPDATE[u.status] || u.status),
      el("span", "", ` ${u.body}`),
      el("div", "when muted", when(u.at)),
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
  return `Scheduled ${when(incident.from)}${incident.to ? ` to ${when(incident.to)}` : ""}`;
}

// An outage the checks found that no written incident covers yet.
function ongoing(stretches, incidents) {
  return stretches.filter((s) => s.to === null && (s.level === "down" || s.level === "degraded") && !coveredByWritten(s, incidents));
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
  const start = dayStarts(now, PAST_DAYS)[0];
  const items = [
    ...incidents
      .filter((i) => !open(i, now) && i.updates[0].at >= start)
      .map((i) => ({ at: i.updates[0].at, node: pastWritten(i, names) })),
    ...stretches
      .filter((s) => (s.level === "down" || s.level === "degraded") && s.to !== null && s.to >= start && !coveredByWritten(s, incidents))
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
function pastRow(id, rowLevel, title, meta, updates) {
  const node = el("article", `past ${rowLevel}`);
  if (id) node.id = id;
  const head = el("div", "row");
  const text = el("div");
  text.append(el("h4", "", title), el("p", "muted", meta));
  head.append(text, el("span", "chip", LABEL[rowLevel]));
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
  const across = day(stretch.from) !== day(stretch.to);
  const from = across ? `${day(stretch.from).replace(/, \d{4}$/, "")} ${clock(stretch.from)}` : clock(stretch.from);
  const to = across ? `${day(stretch.to).replace(/, \d{4}$/, "")} ${clock(stretch.to)}` : clock(stretch.to);
  const meta = `${from} to ${to} ${zoneName()}, ${duration(stretch.to - stretch.from)}. Detected automatically.`;
  return pastRow("", stretch.level, `${name} ${LABEL[stretch.level].toLowerCase()}`, meta, null);
}

// The rows of the components list: each component alone, but the classes'
// sessions as one group, its bar the worst of them each day.
function groups(components) {
  const sessions = components.filter((c) => c.id.startsWith(SESSIONS));
  const others = components.filter((c) => !c.id.startsWith(SESSIONS));
  const rows = others.map((c) => ({ key: c.id, name: c.name, level: c.level, about: ABOUT[c.id] || "", ids: [c.id], parts: [] }));
  if (sessions.length) {
    const checked = sessions.filter((c) => c.level !== "unknown");
    rows.push({
      key: "sessions",
      name: "Sessions",
      level: checked.length ? worst(checked.map((c) => c.level)) : "unknown",
      about: ABOUT.sessions,
      ids: sessions.map((c) => c.id),
      parts: sessions.map((c) => ({ name: c.name.replace(/^Sessions on /, ""), level: c.level })),
    });
  }
  return rows;
}

function aboutLine(row) {
  const line = el("p", "about-line muted", row.about);
  const command = ABOUT_COMMAND[row.key];
  if (command) line.append(el("br"), command[0], el("code", "", command[1]));
  return line;
}

function componentRow(row, status, until, now, days) {
  const mine = status.incidents.filter((s) => row.ids.includes(s.component));
  const item = el("li", row.level);
  const head = el("div", "row");
  head.append(el("span", "name", row.name), el("span", "level", LABEL[row.level]));
  const up = uptime(mine, status.since, until);
  const young = until - status.since < HISTORY_DAYS * DAY;
  const foot = el("div", "uptime muted");
  foot.append(
    el("span", "", `${days} days ago`),
    el("span", "", up === null
      ? `Checked since ${when(status.since)}`
      : `${percent(up)} operational${young ? ` since ${day(status.since)}` : ""}`),
    el("span", "", "Today"),
  );
  item.append(head, aboutLine(row), bars(mine, status.since, until, now, days), foot);
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

function renderStatus(status, incidents, now) {
  const stale = now - status.updated > status.stale_after;
  // Bars from the first checked day, at least NARROW_DAYS wide: 89 days of
  // no data read as broken.
  const recorded = Math.ceil((now - dayStart(status.since)) / DAY);
  const days = NARROW.matches ? NARROW_DAYS : Math.min(HISTORY_DAYS, Math.max(NARROW_DAYS, recorded));
  const names = Object.fromEntries(status.components.map((c) => [c.id, c.name]));
  const live = incidents.filter((i) => open(i, now) && underway(i, now));
  const components = status.components.map((c) => ({ ...c, level: level(c, live, stale) }));
  const [overall, text] = stale ? ["unknown", "Status unknown"] : verdict(components);
  // The outpost writes every change at once and confirms at least hourly,
  // so a fresh file holds until now; a stale one only until it was written.
  const until = stale ? status.updated : now;
  const changed = lastChange(status);
  document.getElementById("overall").className = `overall ${overall}`;
  document.getElementById("verdict").textContent = text;
  // An outage the checks found and no one has written up yet: the banner
  // says since when, once, rather than a card repeating it.
  const found = ongoing(status.incidents, incidents).sort((a, b) => a.from - b.from)[0];
  // A class named in the banner: how to tell whether it is the reader's.
  const classNamed = components.some((c) => c.id.startsWith(SESSIONS) && c.level !== "operational" && c.level !== "unknown");
  const yours = classNamed ? " Find your session's class with machine sessions show." : "";
  document.getElementById("updated").textContent = (stale
    ? `No update since ${when(status.updated)}. Status unknown.`
    : found && overall !== "operational"
      ? `${LABEL[found.level]} since ${when(found.from)}. Detected automatically. No update from the team yet.`
      : `${changed === null ? `No problems since checks began ${day(status.since)}` : `Last change ${ago(now - changed)}`}. Updated ${ago(now - status.updated)}.`) + (stale ? "" : yours);
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
  document.getElementById("updated").textContent = "The status could not be loaded. The page tries again every minute.";
  renderOpen(incidents, {}, now);
}

// --- The controls -----------------------------------------------------------

function city(name) {
  return name.split("/").pop().replaceAll("_", " ");
}

function renderZones() {
  const select = document.getElementById("zone");
  const now = Date.now() / 1000;
  const option = (value, text) => {
    const node = el("option", "", text);
    node.value = value;
    return node;
  };
  const all = el("optgroup");
  all.label = "All time zones";
  all.append(
    ...ZONES.map((name) => ({ name, ...offset(name, now) }))
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
