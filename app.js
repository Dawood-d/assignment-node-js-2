const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const databasePath = path.join(__dirname, "twitterClone.db");

const app = express();

app.use(express.json());

let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () =>
      console.log("Server Running at http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

//getting following people
const getFollowingPeopleIdSofUser = async (username) => {
  const getFollowingPeoplesQuery = `
    SELECT 
    following_user_id FROM follower 
    INNER JOIN user ON user.user_id=follower.following_user_id
    WHERE user.username='${username}'; `;
  const newLocal = await database.all(getFollowingPeoplesQuery);
  const followingPeople = newLocal;
  const arraysOfIds = followingPeople.map(
    (eachUser) => eachUser.following_user_id
  );
  return arraysOfIds;
};

//authentication
const authentication = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken) {
    jwt.verify(jwtToken, "SECRET_KEY", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        request.userId = payload.userId;
        next();
      }
    });
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
};

//tweetAccessVerify
const tweetAccessVerification = async (request, response, next) => {
  const { userId } = request;
  const { tweetId } = request.params;
  const getTweetQuery = `SELECT
     *
    FROM tweet INNER JOIN follower
    ON tweet.user_id=follower.following_user_id
    WHERE tweet.tweet_id='${tweetId}' AND following_user_id='${userId}';
    `;
  const tweet = await database.get(getTweetQuery);
  if (tweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};

//api1
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const getUserQuery = `SELECT * FROM user WHERE username='${username}' ;`;
  const userDetails = await database.get(getUserQuery);
  if (userDetails !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `
        INSERT INTO user(username, password, name, gender)
        VALUES ('${username}','${hashedPassword}','${name}','${gender}'); `;
      await database.run(createUserQuery);
      response.send("User created successfully");
    }
  }
});

//api2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `SELECT * FROM user WHERE username='${username}' ;`;
  const userDetails = await database.get(getUserQuery);
  if (userDetails !== undefined) {
    const isPasswordCorrect = await bcrypt.compare(
      password,
      userDetails.password
    );
    if (isPasswordCorrect) {
      const payload = { username, userId: userDetails.user_id };
      const jwtToken = jwt.sign(payload, "SECRET_KEY");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

//api3
app.get("/user/tweets/feed/", authentication, async (request, response) => {
  const { username } = request;
  const followingPeopleIds = await getFollowingPeopleIdSofUser(username);
  const getTweetsQuery = `
    SELECT
    username,tweet,date_time as dateTime
    FROM user INNER JOIN tweet ON user.user_id = tweet.user_id
    WHERE 
    user.user_id IN (${followingPeopleIds})
    ORDER BY
    date_time DESC
    LIMIT
    4;`;
  const tweets = await database.all(getTweetsQuery);
  response.send(tweets);
});

//api4
app.get("/user/following/", authentication, async (request, response) => {
  const { username, userId } = request;
  const getFollowingPeopleQuery = `SELECT name FROM follower
  INNER JOIN user ON user.user_id=follower.following_user_id
  WHERE following_user_id='${userId}';`;

  const followingPeople = await database.all(getFollowingPeopleQuery);
  response.send(followingPeople);
});

//api5
app.get("/user/followers/", authentication, async (request, response) => {
  const { username, userId } = request;
  const getFollowerQuery = `
  SELECT DISTINCT name FROM follower
  INNER JOIN user ON user.user_id=follower.following_user_id
  WHERE following_user_id='${userId}';`;

  const follower = await database.all(getFollowerQuery);
  response.send(follower);
});

//api6
app.get(
  "/tweets/:tweetId/",
  authentication,
  tweetAccessVerification,
  async (request, response) => {
    const { username, userId } = request;
    const { tweetId } = request.params;
    const getTweetQuery = `SELECT tweet,
    (SELECT COUNT() FROM likes WHERE  tweet_id='${tweetId}') as likes,
    (SELECT COUNT() FROM reply WHERE  tweet_id='${tweetId}') as replies
    date_time as dateTime
    FROM tweet
    WHERE tweet.tweet_id='${tweetId}' ;,`;
    const tweet = await database.get(getTweetQuery);
    response.send(tweet);
  }
);

//api7
app.get(
  "/tweets/:tweetId/likes/",
  authentication,
  tweetAccessVerification,
  async (request, response) => {
    const { tweetId } = request.params;
    const getTweetQuery = `SELECT username
    FROM user INNER JOIN likes ON user.user_id=likes.user_id
    WHERE tweet_id='${tweetId}';`;
    const likedUser = await database.get(getTweetQuery);
    const userArray = likedUser.map((eachUser) => eachUser.username);
    response.send({ likes: userArray });
  }
);

//api8
app.get(
  "/tweets/:tweetId/replies/",
  authentication,
  tweetAccessVerification,
  async (request, response) => {
    const { tweetId } = request.params;
    const getReplyQuery = `SELECT name,reply
    FROM user INNER JOIN reply ON user.user_id=reply.user_id
    WHERE tweet_id='${tweetId}';`;
    const replyUser = await database.get(getReplyQuery);
    response.send({ replies: replyUser });
  }
);

//api9
app.get("/user/tweets/", authentication, async (request, response) => {
  const { userId } = request;
  const getTweetsQuery = `SELECT
    COUNT(DISTINCT like_id) as likes,
    COUNT(DISTINCT reply_id) as replies,
    date_time as dateTime
    FROM tweet LEFT JOIN reply ON tweet.tweet_id=reply.tweet_id
    LEFT JOIN likes ON tweet.tweet_id=like.tweet_id 
    WHERE tweet.user_id='${userId}'
    GROUP BY
    tweet.tweets_id;`;
  const tweets = await database.get(getTweetsQuery);
  response.send(tweets);
});

//api10

app.post("/user/tweets/", authentication, async (request, response) => {
  const { tweet } = request.body;
  const userId = parseInt(request.userId);
  const dateTime = new Date().toJSON().substring(0, 19).replace("T", " ");
  const createTweetQuery = `INSERT INTO tweet(tweet,user_id,date_time)
    VALUES('${tweet}','${userId}','${dateTime}') ;
    `;
  await database.run(createTweetQuery);
  response.send("Created a Tweet");
});

//api11
app.delete("/tweets/:tweetId/", authentication, async (request, response) => {
  const { tweetId } = request.params;
  const { userId } = request;
  const getTheTweetQuery = `SELECT * FROM tweet WHERE user_id='${userId}' AND tweet_id='${tweetId}';`;
  const tweet = await database.get(getTheTweetQuery);
  if (tweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const deleteQuery = `DELETE FROM tweet WHERE tweet_id='${tweetId}';`;
    await database.run(deleteQuery);
    response.send("Tweet Removed");
  }
});

module.exports = app;
