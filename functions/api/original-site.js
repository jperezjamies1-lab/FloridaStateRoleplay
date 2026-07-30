const OLD_INDEX = "https://raw.githubusercontent.com/jperezjamies1-lab/FSRP-Website/d41d6bd1bac88d726c609f26982f35b7f424a2af/index.html";
const TIME_CSS = "\n/* ONLY NEW VISIBLE FEATURE: LIVE DEVICE TIME */\n.fsrp-device-time{\n  display:flex;align-items:center;gap:9px;padding:10px 12px;\n  border:1px solid var(--line,rgba(255,255,255,.10));\n  background:#0b0f15;border-radius:6px;color:#fff;\n  font-size:.69rem;font-weight:900;text-transform:uppercase;\n  white-space:nowrap\n}\n.fsrp-device-time i{\n  width:8px;height:8px;border-radius:50%;\n  background:var(--green,#54df7a);\n  box-shadow:0 0 13px rgba(84,223,122,.9)\n}\n.fsrp-device-time-copy{display:grid;gap:2px}\n.fsrp-device-time-clock{font-variant-numeric:tabular-nums;letter-spacing:.04em}\n.fsrp-device-time-zone{\n  color:var(--muted,#aab2bd);font-size:.54rem;font-weight:700;\n  letter-spacing:.06em;text-transform:none\n}\n@media(max-width:950px){\n  .fsrp-device-time{justify-content:center;border-radius:0}\n}\n@media(max-width:640px){\n  .fsrp-device-time-zone{display:none}\n}\n";
const TIME_HTML = "\n<div class=\"fsrp-device-time\" id=\"fsrp-device-time\" title=\"Time from your device\">\n  <i aria-hidden=\"true\"></i>\n  <span class=\"fsrp-device-time-copy\">\n    <span class=\"fsrp-device-time-clock\" id=\"fsrp-device-time-clock\">--:--:--</span>\n    <span class=\"fsrp-device-time-zone\" id=\"fsrp-device-time-zone\">Device Time</span>\n  </span>\n</div>\n";
const TIME_JS = "\n<script id=\"fsrp-device-time-script\">\n(function(){\n  const clock=document.getElementById(\"fsrp-device-time-clock\");\n  const zone=document.getElementById(\"fsrp-device-time-zone\");\n  if(!clock||!zone)return;\n\n  const detectedZone=Intl.DateTimeFormat().resolvedOptions().timeZone||\"Local Time\";\n  const platform=(navigator.userAgentData&&navigator.userAgentData.platform)||navigator.platform||\"Device\";\n  const device=/iPhone/i.test(navigator.userAgent)?\"iPhone\":\n    /iPad/i.test(navigator.userAgent)?\"iPad\":\n    /Mac/i.test(platform)?\"Mac\":\"Device\";\n\n  function updateFSRPDeviceTime(){\n    const now=new Date();\n    clock.textContent=now.toLocaleTimeString([],{\n      hour:\"numeric\",minute:\"2-digit\",second:\"2-digit\"\n    });\n    zone.textContent=device+\" \u2022 \"+detectedZone.split(\"/\").pop().replaceAll(\"_\",\" \");\n    clock.setAttribute(\"aria-label\",now.toLocaleString());\n  }\n\n  updateFSRPDeviceTime();\n  setInterval(updateFSRPDeviceTime,1000);\n})();\n</script>\n";

function patch(source) {
  if (source.includes('id="fsrp-device-time"')) return source;

  const headClose = source.indexOf("</head>");
  if (headClose !== -1) {
    source = source.slice(0, headClose)
      + '<style id="fsrp-device-time-style">' + TIME_CSS + '</style>\n'
      + source.slice(headClose);
  }

  const navMarker = '<div class="nav-actions">';
  const navAt = source.indexOf(navMarker);
  if (navAt !== -1) {
    const insertAt = navAt + navMarker.length;
    source = source.slice(0, insertAt) + "\n" + TIME_HTML + "\n" + source.slice(insertAt);
  }

  const bodyClose = source.lastIndexOf("</body>");
  if (bodyClose !== -1) {
    source = source.slice(0, bodyClose) + TIME_JS + "\n" + source.slice(bodyClose);
  }
  return source;
}

export async function onRequestGet() {
  try {
    const response = await fetch(OLD_INDEX, {
      headers: { "user-agent": "FSRP-Cloudflare-Time-Only/1.0" }
    });
    if (!response.ok) {
      return new Response("Could not load the pinned original FSRP website.", { status: 502 });
    }
    return new Response(patch(await response.text()), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=120"
      }
    });
  } catch (error) {
    return new Response("Could not load the pinned original FSRP website.", { status: 502 });
  }
}
