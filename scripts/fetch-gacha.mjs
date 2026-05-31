// Fetch raw HTML of gacha.collectorcrypt.com and extract first N cards.
import { writeFileSync } from "fs";

const res = await fetch("https://gacha.collectorcrypt.com/", {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  },
});
const html = await res.text();
writeFileSync("tmp-source.html", html);
console.log("HTML size:", html.length);

// Look for __NEXT_DATA__
const nd = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
if (nd) {
  writeFileSync("tmp-source-next-data.json", nd[1]);
  console.log("__NEXT_DATA__ size:", nd[1].length);
} else {
  console.log("no __NEXT_DATA__");
}
