import express = require("express");
import cors = require("cors");
import { connectDB } from "./connection/connection";
import router from "./router";

const app: express.Application = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false, limit: "5mb" }));
const corsMethods: string[] = ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"];
app.use(
  cors({
    allowedHeaders: ["authorization", "Content-Type"],
    exposedHeaders: ["authorization"],
    origin: true,
    methods: corsMethods.join(","),
    preflightContinue: false,
  })
);

app.get("/", (req, res) => {
  res.json({ message: "This is the FoodSpot API" });
});

// routing
app.use("/api", router);

// connecting to database
connectDB();

export default app;
