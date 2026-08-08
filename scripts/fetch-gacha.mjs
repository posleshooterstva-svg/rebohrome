// Fetch raw HTML from a configured source page and extract first N cards.
import { writeFileSync } from "fs";

const sourceUrl = process.env.SOURCE_GACHA_PAGE_URL;
if (!sourceUrl) {
  throw new Error("Missing SOURCE_GACHA_PAGE_URL.");
}

const res = await fetch(sourceUrl, {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  },
});
const html = await res.text();
writeFileSync("tmp-source.html", html);
console.log("HTML size:", html.length);

const nextData = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
if (nextData) {
  writeFileSync("tmp-source-next-data.json", nextData[1]);
  console.log("__NEXT_DATA__ size:", nextData[1].length);
} else {
  console.log("no __NEXT_DATA__");
}
