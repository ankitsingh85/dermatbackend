import Redis from "ioredis";


if (!process.env.REDIS_URL) {
  throw new Error("REDIS_URL missing");
}


export const redis = new Redis(
  process.env.REDIS_URL,
  {
    maxRetriesPerRequest: 3,
  }
);


redis.on("connect", () => {
  console.log("Redis Connected");
});


redis.on("error", (err) => {
  console.log(
    "Redis Error",
    err.message
  );
});