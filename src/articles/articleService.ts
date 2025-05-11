import { inspect } from "bun";
import { createClient, type RedisClientType } from "redis";
import * as z from "zod";

const articleSchema = z.object({
  id: z.string(),
  title: z.string(),
  userId: z.string(),
  link: z.string(),
  votes: z
    .string()
    .nullish()
    .transform((x) => (x ? parseInt(x) : 0)),
  timestamp: z.string().transform((x) => parseInt(x)),
});

export type Article = z.infer<typeof articleSchema>;

function toArticle(obj: Object): Article {
  return articleSchema.parse(obj);
}

// Constants
export const SCORE_PER_VOTE = 432; // Points added per vote
export const VOTING_WINDOW = 5; // Seconds (simulating a week)

// Redis Client setup
export const createRedisClient = async () => {
  const client = createClient();
  await client.connect();
  return client;
};

// Core functions - these will be implemented by the user
export const postArticle = async (
  client: RedisClientType,
  title: string,
  link: string,
  userId: string
): Promise<string> => {
  const id = await client.incr("article:");
  const timestamp = Math.floor(Date.now() / 1000);
  await client.hSet(`article:${id}`, {
    id,
    title,
    link,
    userId,
    timestamp,
  });
  await client.zAdd("article:created", {
    value: `${id}`,
    score: timestamp,
  });
  await client.zAdd("article:score", {
    value: `${id}`,
    score: timestamp,
  });

  return `${id}`;
};

export const postVote = async (
  client: RedisClientType,
  articleId: string,
  userId: string
): Promise<void> => {
  await client.sAdd(`article:voted:${articleId}`, userId);
  await client.zIncrBy(`article:score`, 432, articleId);
  await client.hIncrBy(`article:${articleId}`, "votes", 1);
};

export const updateArticleGroups = async (
  client: RedisClientType,
  articleId: string,
  addToGroups: string[] = [],
  removeFromGroups: string[] = []
): Promise<boolean> => {
  // Will be implemented by user
  return false; // Placeholder
};

export const getTopArticles = async (
  client: RedisClientType,
  count: number,
  group?: string
): Promise<Article[]> => {
  const ids = await client.zRange("article:score", 0, 100, {
    REV: true,
  });
  //   console.dir(ids, { depth: null });
  const rawArticles = await Promise.all(
    ids.map((x) => client.hGetAll(`article:${x}`))
  );

  //   console.dir(rawArticles, { depth: null });

  const articles = rawArticles.map((x) => toArticle(x));

  return articles;
};

export const getArticleScore = () => {};

// For testing purposes
export const clearAllData = async (client: RedisClientType): Promise<void> => {
  await client.flushDb();
};
