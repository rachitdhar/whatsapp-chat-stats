let data = "";

const colors = [
    "#4a90e2",
    "#e94e77",
    "#f4b400",
    "#1abc9c",
    "#e67e22",
    "#5d6d7e",
    "#9b59b6",
    "#1abc9c"
];

document.getElementById("fileInput").addEventListener("change", function (event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = function (e) {
        data = e.target.result;
        console.log("File loaded. Length:", data.length);
        parse(data);
    };
    reader.readAsText(file);
});

/*
The structure of a single message is of the form:
dd/MM/yy, HH:mm - NAME: MESSAGE
*/

function parse(data) {
    let messages = [];

    let lines = data.split('\n');
    lines.forEach(line => {
        let dtEnd = line.indexOf('-');

        if (messages.length > 0 && !startsWithDate(line)) {
            messages.at(-1).msg += line;
            return;
        }

        // extract the date and time
        const datetime = line.substring(0, dtEnd - 1);

        // extract name and message
        let message = line.substring(dtEnd + 2);
        if (!message.includes(':')) return;
        let [name, msg] = message.split(': ');
        const is_media = msg.includes('<Media omitted>');

        messages.push({
            datetime: datetime,
            name: name,
            msg: msg,
            is_media: is_media
        });
    });

    const stats = analyzeMessages(messages);
    renderHTML(stats);
}


function startsWithDate(line) {
  const dateRegex = /^\d{2}\/\d{2}\/\d{2}, \d{2}:\d{2}/;
  return dateRegex.test(line);
}


function parseDateTime(dateTimeStr) {
  // "05/08/21, 14:31"
  // "05/08/2021, 2:31 PM"
  const [datePart, timePart] = dateTimeStr.split(", ");

  const [day, month, yearShort] = datePart.split("/").map(Number);
  const year = yearShort > 99 ? yearShort
              : yearShort < 70 ? 2000 + yearShort : 1900 + yearShort;

  if (timePart.includes("AM") || timePart.includes("PM")) {
    const [t, timeType] = timePart.split(' ');
    let [hour, minute] = t.split(":").map(Number);

    if (timeType === 'PM') hour += 12;
    else if (hour === 12) hour = 0;
    return new Date(year, month - 1, day, hour, minute);
  }
  const [hour, minute] = timePart.split(":").map(Number);

  return new Date(year, month - 1, day, hour, minute);
}


function analyzeMessages(messages) {
  const stats = {
    from: null,
    to: null,
    totalMessages: 0,
    totalWords: 0,
    totalLetters: 0,
    totalMedia: 0,

    perUser: {},
    messagesPerHour: Array(24).fill(0),
    messagesPerMonth: {}, // YYYY-MM -> count
    topDays: {}
  };

  if (!messages.length) return stats;

  // Helper functions
  const wordCount = msg =>
    msg.trim() ? msg.trim().split(/\s+/).length : 0;

  const letterCount = msg =>
    msg.replace(/\s/g, "").length;

  // Sort messages by datetime
  const withDateTime = messages.map(m => ({
    ...m,
    datetime: parseDateTime(m.datetime)
  })).sort((a, b) => a.datetime - b.datetime);

  stats.from = withDateTime[0].datetime;
  stats.to   = withDateTime[withDateTime.length - 1].datetime;

  for (const m of withDateTime) {
    const { name, msg, is_media, datetime } = m;

    stats.totalMessages++;

    const words = wordCount(msg);
    const letters = letterCount(msg);

    stats.totalWords += words;
    stats.totalLetters += letters;
    if (is_media) stats.totalMedia++;

    // ---- Per-user stats ----
    if (!stats.perUser[name]) {
      stats.perUser[name] = {
        messages: 0,
        words: 0,
        letters: 0,
        media: 0,
        avgLettersPerMessage: 0
      };
    }

    const user = stats.perUser[name];
    user.messages++;
    user.words += words;
    user.letters += letters;
    if (is_media) user.media++;

    // ---- Messages per hour ----
    const hour = datetime.getHours();
    stats.messagesPerHour[hour]++;

    // ---- Messages per month ----
    const monthKey = `${datetime.getFullYear()}-${String(
      datetime.getMonth() + 1
    ).padStart(2, "0")}`;

    stats.messagesPerMonth[monthKey] =
      (stats.messagesPerMonth[monthKey] || 0) + 1;
  }

  // ---- Compute averages ----
  for (const name in stats.perUser) {
    const u = stats.perUser[name];
    u.avgLettersPerMessage =
      u.messages ? u.letters / u.messages : 0;
  }

  stats.topDays = getTopDaysWithMostMessages(messages, 20);
  return stats;
}


function getTopDaysWithMostMessages(messages, topN = 20) {
  const countsByDay = {};

  for (const msg of messages) {
    const d = msg.datetime instanceof Date
      ? msg.datetime
      : parseDateTime(msg.datetime);

    const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    countsByDay[dayKey] = (countsByDay[dayKey] || 0) + 1;
  }

  return Object.entries(countsByDay)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .reduce((obj, [day, count]) => {
      obj[day] = count;
      return obj;
    }, {});
}


// rendering in HTML

function renderStatBlockWithoutBar(parent, headingText, dataObj) {
  const section = document.createElement("section");
  section.style.marginBottom = "20px";

  const heading = document.createElement("h3");
  heading.textContent = headingText;
  section.appendChild(heading);

  const rule = document.createElement("hr");
  rule.style.marginBottom = "20px";
  section.appendChild(rule);

  const list = document.createElement("ul");

  for (const [key, value] of Object.entries(dataObj)) {
    const li = document.createElement("li");
    li.textContent = `${key}: ${value}`;
    list.appendChild(li);
  }

  section.appendChild(list);
  parent.appendChild(section);
}

function renderStatBlock(parent, headingText, dataObj, barColor) {
  const section = document.createElement("section");
  section.style.marginBottom = "20px";

  const heading = document.createElement("h3");
  heading.textContent = headingText;
  section.appendChild(heading);

  const rule = document.createElement("hr");
  rule.style.marginBottom = "20px";
  section.appendChild(rule);

  const maxValue = Math.max(...Object.values(dataObj), 1);

  for (const [key, value] of Object.entries(dataObj)) {
    const row = document.createElement("div");
    row.className = "stat-row";

    const keyEl = document.createElement("div");
    keyEl.className = "stat-key";
    keyEl.textContent = key;

    const barWrap = document.createElement("div");
    barWrap.className = "stat-bar-wrap";

    const bar = document.createElement("div");
    bar.className = "stat-bar";
    bar.style.width = `${(value / maxValue) * 100}%`;
    bar.style.background = barColor;

    barWrap.appendChild(bar);

    const valEl = document.createElement("div");
    valEl.className = "stat-value";
    valEl.textContent = value;

    row.appendChild(keyEl);
    row.appendChild(barWrap);
    row.appendChild(valEl);

    section.appendChild(row);
  }

  parent.appendChild(section);
}



function renderPerUserStat(parent, heading, perUserData, field, barColor) {
  const data = {};

  for (const name in perUserData) {
    data[name] = Math.round(perUserData[name][field]);
  }

  renderStatBlock(parent, heading, data, barColor);
}


function renderArrayStat(parent, heading, arr, labelFn, barColor) {
  const data = {};

  arr.forEach((count, index) => {
    data[labelFn(index)] = count;
  });

  renderStatBlock(parent, heading, data, barColor);
}


function renderHTML(stats) {
    const container = document.getElementById("stats");

    // ---- Global stats ----
    renderStatBlockWithoutBar(container, "Overall Statistics", {
    "From": stats.from.toLocaleString(),
    "To": stats.to.toLocaleString(),
    "Total Messages": stats.totalMessages,
    "Total Words": stats.totalWords,
    "Total Letters": stats.totalLetters,
    "Total Media": stats.totalMedia
    });

    // ---- Per-user stats ----
    renderPerUserStat(container, "Messages per User", stats.perUser, "messages", colors[0]);
    renderPerUserStat(container, "Words per User", stats.perUser, "words", colors[1]);
    renderPerUserStat(container, "Letters per User", stats.perUser, "letters", colors[2]);
    renderPerUserStat(
    container,
    "Average Letters per Message",
    stats.perUser,
    "avgLettersPerMessage",
    colors[3]
    );
    renderPerUserStat(container, "Media Files per User", stats.perUser, "media", colors[4]);

    // ---- Messages per hour ----
    renderArrayStat(
    container,
    "Messages per Hour of Day",
    stats.messagesPerHour,
    h => `${h}:00 - ${h + 1}:00`, colors[5]
    );

    // ---- Messages per month ----
    renderStatBlock(container, "Messages per Month", stats.messagesPerMonth, colors[6]);

    // ---- Days with Most Messages ---
    renderStatBlock(
    container,
    "Days with Most Messages",
    stats.topDays,
    colors[7]
    );
}

