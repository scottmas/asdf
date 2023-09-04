import fs from "fs";
import { URL } from "url";
import _ from "lodash";

import blackListedUrls from "./fixtures/blackListedUrls.json";
import extraUrls from "./fixtures/extraUrls.json";
import domainsRaw from "./fixtures/domains.json";
import { determineOptimalConcurrency } from "./determineOptimalConcurrency.js";
import PQueue from "p-queue";

const __extraUrls: Record<string, 1> = { ...(extraUrls as any) };
const __blacklistedUrls: Record<string, 1> = { ...(blackListedUrls as any) };

const urls = _.shuffle([
  ...Object.keys(domainsRaw).map((a) => "https://" + a),
  ...Object.keys(extraUrls),
]).filter((url) => !(blackListedUrls as any)[url]);

const doFetch = () => {
  const thisUrl = urls.pop();
  if (!thisUrl) {
    throw new Error("RAN OUT OF URLS!!!");
  }
  return fetch(thisUrl)
    .then((resp) => {
      return resp.text();
    })
    .then((html) => {
      //If we get low on urls, add more for the next run...
      if (urls.length < 5000) {
        const pagePaths = extractNthMatchingGroups(
          html,
          /href\="(\/[^.\s%]+)"/g,
          1
        );

        addExtraUrls(
          pagePaths.map((a) => new URL(a, thisUrl).toString()),
          thisUrl
        );
      }
    })
    .catch(() => {
      addUrlToBlacklist(thisUrl);
    });
};

const optimalConcurrency = await determineOptimalConcurrency(doFetch, {
  minConcurrency: 50,
  numSecondsPerConcurrencyTest: 5,
  stepSize: 5,
  numWarmupTasks: 100,
});

const queue = new PQueue({
  concurrency: optimalConcurrency,
  timeout: Infinity,
  throwOnTimeout: false,
});

const startTime = Date.now();
await Promise.all(
  Array.from({ length: 2000 }).map(async () => {
    await new Promise((res) => setTimeout(res, Math.random() * 50));
    await queue.add(doFetch);
  })
);

console.info(
  "TIME TO OPTIMALLY REQUEST 2000 WEB PAGES:",
  Date.now() - startTime
);

function extractNthMatchingGroups(str: string, regex: RegExp, n = 1) {
  const matchingGroups = [];

  let match;
  while ((match = regex.exec(str)) !== null) {
    matchingGroups.push(match[n]!);
  }

  return matchingGroups;
}

function addUrlToBlacklist(badUrl: string) {
  if (!__blacklistedUrls[badUrl]) {
    __blacklistedUrls[badUrl] = 1;
    fs.writeFileSync(
      "/" +
        import.meta.url.split("/").slice(3, -1).join("/") +
        "/fixtures/blackListedUrls.json",
      JSON.stringify(__blacklistedUrls, null, 2)
    );
    console.info("Blacklisted url", badUrl);
  }
}

function addExtraUrls(newUrls: string[], callingUrl: string) {
  let writeCount = 0;
  newUrls.forEach((urlRaw) => {
    const thisURL = new URL(urlRaw);
    thisURL.hash = "";
    thisURL.search = "";
    const url = thisURL.toString();
    if (!__extraUrls[url]) {
      writeCount++;
      __extraUrls[url] = 1;
    }
  });

  if (writeCount) {
    console.info(`Wrote ${writeCount} new url(s) for ${callingUrl}`);
    fs.writeFileSync(
      "/" +
        import.meta.url.split("/").slice(3, -1).join("/") +
        "/fixtures/extraUrls.json",
      JSON.stringify(__extraUrls, null, 2)
    );
  }
}
