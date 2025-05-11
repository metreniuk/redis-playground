## Articles and votes

### Requirements

1. Keep track of most interesting articles
   - score = timestamp + (votes \* 432)

> To keep things simple, we’ll say that the score of an item is a function of the time that the article was posted, plus a constant multiplier times the number of votes that the article has received.
> For our constant, we’ll take the number of seconds in a day (86,400) divided by the number of votes required (200) to last a full day, which gives us 432 “points” added to the score per vote.

2. Keep track of voters and implement decay

   - voters are unique

   - score is fixed after 1 week

> In order to prevent users from voting for the same article more than once, we need to store a unique listing of users who have voted for each article. For this, we’ll use a SET for each article, and store the member IDs of all users who have voted on the given article. An example SET of users who have voted on an article is shown in figure 1.10. For the sake of memory use over time, we’ll say that after a week users can no longer vote on an article and its score is fixed. After that week has passed, we’ll delete the SET of users who have voted on the article.

3. Attribute articles to groups.
   - article can be part of multiple groups
   - can retrieve all articles from a group

> To offer groups requires two steps. The first step is to add information about which articles are in which groups, and the second is to actually fetch articles from a group. We’ll use a SET for each group, which stores the article IDs of all articles in that group. In listing 1.9, we see a function that allows us to add and remove articles from groups.

### API

- `postArticle`
- `postVote`
- `updateArticleGroups`
- `getTopArticles`
