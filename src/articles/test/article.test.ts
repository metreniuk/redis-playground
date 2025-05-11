import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  afterAll,
  beforeAll,
} from "bun:test";
import {
  createRedisClient,
  postArticle,
  postVote,
  updateArticleGroups,
  getTopArticles,
  clearAllData,
  SCORE_PER_VOTE,
  VOTING_WINDOW,
} from "../articleService";
import type { Article } from "../articleService";

describe("Redis Article Service", () => {
  let client: any;

  // Setup Redis client before all tests
  beforeAll(async () => {
    client = await createRedisClient()!;
  });

  // Clear Redis before each test
  beforeEach(async () => {
    await clearAllData(client);
  });

  // Clean up after all tests are done
  afterAll(async () => {
    await client.quit();
  });

  describe("Article Posting", () => {
    test("should successfully post a new article", async () => {
      // Arrange
      const title = "Test Article";
      const link = "https://test.com/article";
      const userId = "user1";

      // Act
      const articleId = await postArticle(client, title, link, userId);

      // Assert
      expect(articleId).toBeDefined();

      // Get top articles to verify the article was posted
      const articles = await getTopArticles(client, 10);
      expect(articles.length).toBe(1);
      expect(articles[0].id).toBe(articleId);
    });

    test("should calculate score correctly based on timestamp", async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);
      const title = "Test Article";
      const link = "https://test.com/article";
      const userId = "user1";

      // Act
      const articleId = await postArticle(client, title, link, userId);

      // Assert
      const articles = await getTopArticles(client, 10);
      expect(articles[0].score).toBeGreaterThanOrEqual(now); // Score should be at least the timestamp
      expect(articles[0].score).toBeLessThanOrEqual(now + 5); // Allow small buffer for test execution

      // Score should match timestamp when there are no votes
      expect(articles[0].score).toBeCloseTo(articles[0].timestamp, 0);
    });

    test("should post multiple articles with correct ordering", async () => {
      // Arrange & Act
      const articleId1 = await postArticle(
        client,
        "First Article",
        "https://test.com/1",
        "user1"
      );

      // Wait a second to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const articleId2 = await postArticle(
        client,
        "Second Article",
        "https://test.com/2",
        "user2"
      );

      // Assert - newer articles should have higher scores by default (due to timestamp)
      const articles = await getTopArticles(client, 10);
      expect(articles.length).toBe(2);
      expect(articles[0].id).toBe(articleId2); // Newer article should be first
      expect(articles[1].id).toBe(articleId1); // Older article should be second
    });
  });

  describe("Voting", () => {
    test.only("should increase article score when voted", async () => {
      // Arrange
      const articleId = await postArticle(
        client,
        "Test Article",
        "https://test.com/article",
        "user1"
      );

      // Get initial score
      const articlesBefore = await getTopArticles(client, 10);
      const initialScore = articlesBefore[0].score;

      // Act
      const voteResult = await postVote(client, articleId, "user2");

      const articlesAfter = await getTopArticles(client, 10);
      expect(articlesAfter[0].votes).toBe(1);
      expect(articlesAfter[0].score).toBe(initialScore + SCORE_PER_VOTE);
    });

    test("should not allow the same user to vote twice", async () => {
      // Arrange
      const articleId = await postArticle(
        client,
        "Test Article",
        "https://test.com/article",
        "user1"
      );

      // First vote should succeed
      const firstVote = await postVote(client, articleId, "user2");
      // Act - Second vote from same user
      const secondVote = await postVote(client, articleId, "user2");

      // Verify votes count is still 1
      const articles = await getTopArticles(client, 10);
      expect(articles[0].votes).toBe(1);
    });

    test("should not allow voting after the voting window has expired", async () => {
      // Arrange
      const articleId = await postArticle(
        client,
        "Test Article",
        "https://test.com/article",
        "user1"
      );

      // Wait for the voting window to expire (VOTING_WINDOW seconds)
      await new Promise((resolve) =>
        setTimeout(resolve, VOTING_WINDOW * 1000 + 100)
      );

      // Act
      const voteResult = await postVote(client, articleId, "user2");

      // Assert
      expect(voteResult).toBe(false);

      // Verify no vote was recorded
      const articles = await getTopArticles(client, 10);
      expect(articles[0].votes).toBe(0);
    });

    test("should change article ranking based on votes", async () => {
      // Arrange - Create two articles with the older one first
      const articleId1 = await postArticle(
        client,
        "First Article",
        "https://test.com/1",
        "user1"
      );

      // Wait a second to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const articleId2 = await postArticle(
        client,
        "Second Article",
        "https://test.com/2",
        "user2"
      );

      // Verify initial order (newer article first)
      const initialArticles = await getTopArticles(client, 10);
      expect(initialArticles[0].id).toBe(articleId2);
      expect(initialArticles[1].id).toBe(articleId1);

      // Act - Vote for the older article
      await postVote(client, articleId1, "user3");

      // Assert - The older article should now be ranked higher due to votes
      const articlesAfterVote = await getTopArticles(client, 10);
      expect(articlesAfterVote[0].id).toBe(articleId1);
      expect(articlesAfterVote[1].id).toBe(articleId2);
    });
  });

  describe("Article Groups", () => {
    test("should add an article to a group during creation", async () => {
      // Arrange
      const group = "technology";

      // Act
      const articleId = await postArticle(
        client,
        "Test Article",
        "https://test.com/article",
        "user1",
        [group]
      );

      // Assert
      const groupArticles = await getTopArticles(client, 10, group);
      expect(groupArticles.length).toBe(1);
      expect(groupArticles[0].id).toBe(articleId);
    });

    test("should add an article to multiple groups", async () => {
      // Arrange
      const articleId = await postArticle(
        client,
        "Test Article",
        "https://test.com/article",
        "user1"
      );
      const groups = ["technology", "programming", "news"];

      // Act
      const result = await updateArticleGroups(client, articleId, groups);

      // Assert
      expect(result).toBe(true);

      // Verify article appears in all groups
      for (const group of groups) {
        const groupArticles = await getTopArticles(client, 10, group);
        expect(groupArticles.length).toBe(1);
        expect(groupArticles[0].id).toBe(articleId);
      }
    });

    test("should remove an article from a group", async () => {
      // Arrange
      const groups = ["technology", "programming"];
      const articleId = await postArticle(
        client,
        "Test Article",
        "https://test.com/article",
        "user1",
        groups
      );

      // Verify article is in both groups
      const techArticlesBefore = await getTopArticles(client, 10, "technology");
      const progArticlesBefore = await getTopArticles(
        client,
        10,
        "programming"
      );
      expect(techArticlesBefore.length).toBe(1);
      expect(progArticlesBefore.length).toBe(1);

      // Act - Remove from programming group
      const result = await updateArticleGroups(
        client,
        articleId,
        [],
        ["programming"]
      );

      // Assert
      expect(result).toBe(true);

      // Verify article is still in technology but not in programming
      const techArticlesAfter = await getTopArticles(client, 10, "technology");
      const progArticlesAfter = await getTopArticles(client, 10, "programming");
      expect(techArticlesAfter.length).toBe(1);
      expect(progArticlesAfter.length).toBe(0);
    });

    test("should handle adding and removing groups in one operation", async () => {
      // Arrange
      const articleId = await postArticle(
        client,
        "Test Article",
        "https://test.com/article",
        "user1",
        ["group1", "group2"]
      );

      // Act
      const result = await updateArticleGroups(
        client,
        articleId,
        ["group3"],
        ["group1"]
      );

      // Assert
      expect(result).toBe(true);

      // Verify correct group membership
      const group1Articles = await getTopArticles(client, 10, "group1");
      const group2Articles = await getTopArticles(client, 10, "group2");
      const group3Articles = await getTopArticles(client, 10, "group3");

      expect(group1Articles.length).toBe(0); // Removed
      expect(group2Articles.length).toBe(1); // Unchanged
      expect(group3Articles.length).toBe(1); // Added
    });

    test("should retrieve articles from the same group sorted by score", async () => {
      // Arrange
      const group = "technology";

      // Create articles in the same group
      const articleId1 = await postArticle(
        client,
        "First Article",
        "https://test.com/1",
        "user1",
        [group]
      );
      const articleId2 = await postArticle(
        client,
        "Second Article",
        "https://test.com/2",
        "user2",
        [group]
      );

      // Vote for the first article to boost its score
      await postVote(client, articleId1, "user3");

      // Act
      const articles = await getTopArticles(client, 10, group);

      // Assert
      expect(articles.length).toBe(2);
      expect(articles[0].id).toBe(articleId1); // Higher score due to vote
      expect(articles[1].id).toBe(articleId2);
    });
  });
});
