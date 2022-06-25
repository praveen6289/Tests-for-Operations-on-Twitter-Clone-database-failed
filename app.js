const express = require("express");

const app = express();
app.use(express.json());

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const bcrypt = require("bcrypt");
const jsonwebtoken = require("jsonwebtoken");

const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
  }
};

initializeDBAndServer();

const authenticateJWTToken = async (request, response, next) => {
  const authHeader = request.headers["authorization"];
  let jwtToken;
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken !== undefined) {
    await jsonwebtoken.verify(
      jwtToken,
      "MY_SECRET_KEY",
      async (error, payload) => {
        if (error) {
          response.status(401);
          response.send("Invalid JWT Token");
        } else {
          request.user_id = payload.user_id;
          next();
        }
      }
    );
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
};

//API 1

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const isPresent = `
        SELECT
             *
        FROM
            user
        WHERE
            username='${username}';
        `;
  const isUserPresent = await db.get(isPresent);
  if (isUserPresent === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);

      const createUser = `
        INSERT INTO user(name,username,password,gender)
        VALUES(
            '${name}',
            '${username}',
            '${hashedPassword}',
            '${gender}');`;
      await db.run(createUser);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//API 2

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const isPresent = `
    SELECT 
        * 
    FROM
        user
    WHERE
        username='${username}';`;
  const isUserPresent = await db.get(isPresent);
  if (isUserPresent !== undefined) {
    const isPasswordMatched = await bcrypt.compare(
      password,
      isUserPresent.password
    );
    if (isPasswordMatched) {
      const userDetails = { user_id: isUserPresent.user_id };
      let jwtToken = await jsonwebtoken.sign(userDetails, "MY_SECRET_KEY");
      response.send({ jwtToken: `${jwtToken}` });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

//API 3
app.get(
  "/user/tweets/feed/",
  authenticateJWTToken,
  async (request, response) => {
    const { user_id } = request;
    const getTweets = `SELECT username,tweet,date_time as dateTime
            FROM
                user 
            JOIN follower ON user.user_id=follower.following_user_id
            JOIN tweet ON tweet.user_id=follower.following_user_id
            WHERE
                follower_user_id=${user_id}
            ORDER BY dateTime DESC
            LIMIT   4;`;
    const result = await db.all(getTweets);
    response.send(result);
  }
);

//API 4
app.get("/user/following/", authenticateJWTToken, async (request, response) => {
  const { user_id } = request;
  const getUserFollowing = `
    SELECT 
        name
    FROM
        user JOIN follower ON user.user_id=follower.following_user_id
    WHERE
        follower_user_id=${user_id};`;
  const result = await db.all(getUserFollowing);
  response.send(result);
});

//API 5
app.get("/user/followers/", authenticateJWTToken, async (request, response) => {
  const { user_id } = request;
  const getFollowers = `
    SELECT 
        name
    FROM
        user JOIN follower ON user.user_id=follower.follower_user_id
    WHERE
        following_user_id=${user_id};`;
  const result = await db.all(getFollowers);
  response.send(result);
});

//API 6
app.get(
  "/tweets/:tweetId/",
  authenticateJWTToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { user_id } = request;

    const userFollowingTweetIds = `
        SELECT 
            tweet_id
        FROM
            tweet JOIN follower ON tweet.user_id=follower.following_user_id
        WHERE
            follower_user_id=${user_id};`;
    const result = await db.all(userFollowingTweetIds);

    let followingTweetIdList = [];
    for (let id of result) {
      followingTweetIdList.push(id.tweet_id);
    }
    if (followingTweetIdList.includes(parseInt(tweetId))) {
      const getTweetQuery = `
            SELECT 
                tweet, (SELECT 
                            count(like_id) 
                        FROM
                            like 
                        WHERE
                            tweet_id=${tweetId}) AS likes,
                        (SELECT 
                                count(reply_id) 
                        FROM
                            reply 
                        WHERE
                            tweet_id=${tweetId}) AS replies, date_time AS dateTime
            FROM 
                tweet 
            WHERE 
                tweet.tweet_id=${tweetId};`;
      const tweet = await db.get(getTweetQuery);
      response.send(tweet);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateJWTToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { user_id } = request;
    const userFollowingTweetIds = `
        SELECT
             tweet_id
        FROM
            tweet JOIN follower ON tweet.user_id=follower.following_user_id
        WHERE
            follower_user_id=${user_id};`;
    const result = await db.all(userFollowingTweetIds);
    let followingTweetIdList = [];
    for (let id of result) {
      followingTweetIdList.push(id.tweet_id);
    }
    if (followingTweetIdList.includes(parseInt(tweetId))) {
      const getUserLikedTweet = `
            SELECT 
                username 
            FROM
                 user JOIN like ON user.user_id=like.user_id
            WHERE 
                like.tweet_id=${tweetId};`;
      const usernames = await db.all(getUserLikedTweet);
      let userNames = [];
      for (let name of usernames) {
        userNames.push(name.username);
      }
      response.send({ likes: userNames });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateJWTToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { user_id } = request;
    const userFollowingTweetIds = `
        SELECT 
            tweet_id
        FROM
            tweet JOIN follower ON tweet.user_id=follower.following_user_id
        WHERE
            follower_user_id=${user_id};`;
    const result = await db.all(userFollowingTweetIds);
    let followingTweetIdList = [];
    for (let id of result) {
      followingTweetIdList.push(id.tweet_id);
    }
    if (followingTweetIdList.includes(parseInt(tweetId))) {
      const getUserReply = `
                SELECT 
                    name,reply 
                FROM user JOIN reply ON user.user_id=reply.user_id
                WHERE 
                    reply.tweet_id=${tweetId};`;
      const usernames = await db.all(getUserReply);
      let names = [];
      for (let name of usernames) {
        names.push({ name: name.name, reply: name.reply });
      }
      response.send({ replies: names });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 9
app.get("/user/tweets/", authenticateJWTToken, async (request, response) => {
  const { user_id } = request;
  const getAllTweets = `
        SELECT 
            tweet_id 
        FROM 
            tweet
        WHERE
            user_id=${user_id};`;
  const tweetIds = await db.all(getAllTweets);
  let tweetIdList = [];
  for (let id of tweetIds) {
    tweetIdList.push(id.tweet_id);
  }
  let ownTweets = [];
  for (let id of tweetIdList) {
    const getTweetQuery = `
        SELECT tweet, (SELECT count(like_id) FROM like WHERE tweet_id=${id}) AS likes,(SELECT count(reply_id) FROM reply WHERE tweet_id=${id} ) AS replies,
            date_time AS dateTime
        FROM tweet 
        WHERE tweet.tweet_id=${id};`;
    const tweet = await db.get(getTweetQuery);
    ownTweets.push(tweet);
  }
  response.send(ownTweets);
});

//API 10
app.post("/user/tweets/", authenticateJWTToken, async (request, response) => {
  const { tweet } = request.body;
  const { user_id } = request;
  const postTweet = `
        INSERT INTO tweet(tweet,user_id)
        VALUES 
        ('${tweet}',
        ${user_id});`;
  await db.run(postTweet);
  response.send("Created a Tweet");
});

//API 11
app.delete(
  "/tweets/:tweetId/",
  authenticateJWTToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { user_id } = request;
    const getAllTweets = `
        SELECT 
            tweet_id 
        FROM 
            tweet
        WHERE
            user_id=${user_id};`;
    const tweetIds = await db.all(getAllTweets);
    let tweetIdList = [];
    for (let id of tweetIds) {
      tweetIdList.push(id.tweet_id);
    }
    if (tweetIdList.includes(parseInt(tweetId))) {
      const deleteQuery = `
        DELETE FROM
        tweet
            WHERE tweet_id=${tweetId};`;
      await db.run(deleteQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
