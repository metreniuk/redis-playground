import * as path from "path";
import * as fs from "fs/promises";
import { createClient, type RedisClientType } from "redis";
import { randomUUIDv7 } from "bun";

const DICT_FILE = path.join(__dirname, "english-dict.csv");

let _client: RedisClientType;

function getClient() {
  if (!_client) {
    _client = createClient();
    _client.connect();
  }
  return _client;
}

async function setDict() {
  const client = getClient();
  const file = await fs.readFile(DICT_FILE, "utf-8");
  const dict = file
    .split("\n")
    .filter((x, i) => i !== 0)
    .map((x) => {
      const words = x.split(",");
      return [words[0].toLowerCase(), words[2] || ""];
    })
    .filter((x) => !!x[0] && !!x[1])
    .filter((x) => /[a-z]/.test(x[0][0]));

  const promises: Promise<unknown>[] = [];

  promises.push(
    client.zAdd(
      "words:all",
      dict.map((x) => ({ value: x[0], score: 0 }))
    )
  );
  for (let word of dict) {
    promises.push(client.set(`words:defs:${word[0]}`, word[1]));
  }

  await Promise.all(promises);
  console.log("success");
}

async function flushDict() {
  const client = getClient();

  await client.del(`words:all`);
  const keys = await client.keys("words:defs:*");
  await Promise.all(keys.map((k) => client.del(k)));

  console.log("success");
}

function getPrefix(word: string): [string, string] {
  const lastCh = word.at(-1)!;
  const withoutLastCh = word.slice(0, -1);
  const suffix = String.fromCharCode(lastCh.charCodeAt(0) - 1);
  const end = String.fromCharCode("z".charCodeAt(0) + 1);

  return [withoutLastCh + suffix + end, word + end];
}

async function getSimilarWords(target: string) {
  const client = getClient();
  const uuid = randomUUIDv7();

  let [start, end] = getPrefix(target);
  start += uuid;
  end += uuid;
  const wordsLen = await client.zCard("words:all");
  await client.zAdd("words:all", [{ value: start, score: 0 }]);
  await client.zAdd("words:all", [{ value: end, score: 0 }]);
  const startIdx = await client.zRank("words:all", start);
  let endIdx = await client.zRank("words:all", end);
  if (startIdx === null || endIdx === null) {
    throw new Error("failed to find similar word");
  }
  //   - 2 to account for the removed start and end
  endIdx = Math.min(endIdx, wordsLen, startIdx + 100) - 2;

  await client.zRem("words:all", start);
  await client.zRem("words:all", end);
  const similarWords = await client.zRange("words:all", startIdx, endIdx);

  return similarWords;
}

async function getSimilarWithDefs(target: string) {
  const client = getClient();
  const similarWords = await getSimilarWords(target);
  const defs = await Promise.all(
    similarWords.map((x) => client.get(`words:defs:${x}`))
  );
  const wordsWithDefs = similarWords.map((x, i) => [x, defs[i]]);
  console.log(wordsWithDefs);
  return wordsWithDefs;
}

async function main() {
  const args = process.argv.slice(2);

  const [command, ...commandArgs] = args;

  let res: any;
  if (command === "set-dict") {
    res = await setDict();
  } else if (command === "flush-dict") {
    res = await flushDict();
  } else if (command === "get-similar") {
    res = await getSimilarWords(commandArgs[0]);
  } else if (command === "get-similar-with-defs") {
    res = await getSimilarWithDefs(commandArgs[0]);
  } else {
    throw new Error(`Unknown command: ${command}`);
  }

  console.log(`@@ ${command} ${commandArgs}: `, res);

  getClient().quit();
}

main();
